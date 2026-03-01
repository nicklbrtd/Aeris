import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { Prisma, type User as DbUser } from '@prisma/client';
import { z } from 'zod';

import { createSession, setSessionCookie, clearSessionCookie } from '../lib/auth.js';
import { ensureGeneralCommunity, addUserToChat } from '../lib/chatService.js';
import { normalizeEmail, normalizePhone, maskPhone } from '../lib/contact.js';
import { createCsrfToken } from '../lib/csrf.js';
import { createPhoneOtp, verifyPhoneOtp } from '../lib/otp.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { authLimiter, otpSendLimiter, otpVerifyLimiter } from '../lib/rateLimiter.js';
import { sanitizeNickname } from '../lib/sanitize.js';
import { sendSms } from '../lib/sms.js';

const joinSchema = z.object({
  code: z.string().min(3).max(64),
  nickname: z.string().min(2).max(40),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

const registerSchema = z
  .object({
    nickname: z.string().min(2).max(40),
    password: z.string().min(8).max(128),
    email: z.string().email().optional(),
    phone: z.string().min(8).max(24).optional(),
    avatarUrl: z.string().url().optional().or(z.literal('')),
  })
  .refine((data) => Boolean(data.email) !== Boolean(data.phone), {
    message: 'Нужно указать email или телефон (одно из двух)',
  });

const verifyPhoneSchema = z.object({
  phone: z.string().min(8).max(24),
  code: z.string().regex(/^\d{6}$/),
});

const resendPhoneSchema = z.object({
  phone: z.string().min(8).max(24),
});

const loginSchema = z.object({
  identifier: z.string().min(2).max(120),
  password: z.string().min(8).max(128),
});

function isPhoneCandidate(value: string): boolean {
  return /^\+?[\d\s().-]{8,24}$/.test(value.trim());
}

async function issueSessionReply(params: {
  fastify: FastifyInstance;
  reply: FastifyReply;
  user: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    role: 'admin' | 'user';
    email: string | null;
    phone: string | null;
    phoneVerifiedAt: Date | null;
  };
}) {
  const sessionId = await createSession(params.user.id);
  setSessionCookie(params.reply, sessionId);

  return {
    user: {
      id: params.user.id,
      nickname: params.user.nickname,
      avatarUrl: params.user.avatarUrl,
      role: params.user.role,
      email: params.user.email,
      phone: params.user.phone,
      phoneVerified: Boolean(params.user.phoneVerifiedAt),
    },
    csrfToken: createCsrfToken(sessionId),
    guestToken: params.fastify.appConfig.NODE_ENV !== 'production' ? sessionId : null,
  };
}

function handleUniqueError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target || '');
    if (target.includes('email')) {
      return 'Этот email уже используется';
    }
    if (target.includes('phone')) {
      return 'Этот номер уже используется';
    }
    if (target.includes('nickname')) {
      return 'Этот ник уже занят';
    }
  }
  return 'Не удалось выполнить операцию';
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Некорректные данные' });
    }

    const ip = request.ip;
    if (!authLimiter.consume(`register:ip:${ip}`)) {
      return reply.code(429).send({ error: 'Слишком много попыток регистрации' });
    }

    const nickname = sanitizeNickname(parsed.data.nickname);
    if (nickname.length < 2) {
      return reply.code(400).send({ error: 'Слишком короткий ник' });
    }

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(parsed.data.password);
    } catch {
      return reply.code(500).send({ error: 'Не удалось безопасно обработать пароль' });
    }
    const avatarUrl = parsed.data.avatarUrl || null;

    if (parsed.data.email) {
      const email = normalizeEmail(parsed.data.email);

      try {
        const usersCount = await fastify.prisma.user.count();
        const user = await fastify.prisma.user.create({
          data: {
            nickname,
            email,
            passwordHash,
            avatarUrl,
            role: usersCount === 0 ? 'admin' : 'user',
          },
        });

        const generalId = await ensureGeneralCommunity();
        await addUserToChat(generalId, user.id);

        const payload = await issueSessionReply({
          fastify,
          reply,
          user: {
            id: user.id,
            nickname: user.nickname,
            avatarUrl: user.avatarUrl,
            role: user.role,
            email: user.email,
            phone: user.phone,
            phoneVerifiedAt: user.phoneVerifiedAt,
          },
        });

        return reply.send(payload);
      } catch (error) {
        return reply.code(400).send({ error: handleUniqueError(error) });
      }
    }

    const normalizedPhone = normalizePhone(parsed.data.phone || '');
    if (!normalizedPhone) {
      return reply.code(400).send({ error: 'Некорректный номер телефона' });
    }

    if (!otpSendLimiter.consume(`otp-send:ip:${ip}`) || !otpSendLimiter.consume(`otp-send:phone:${normalizedPhone}`)) {
      return reply.code(429).send({ error: 'Слишком часто отправляете код' });
    }

    const existingByPhone = await fastify.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingByPhone?.phoneVerifiedAt) {
      return reply.code(400).send({ error: 'Этот номер уже подтверждён и используется' });
    }

    let user: DbUser;
    try {
      if (existingByPhone) {
        user = await fastify.prisma.user.update({
          where: { id: existingByPhone.id },
          data: {
            nickname,
            passwordHash,
            avatarUrl,
          },
        });
      } else {
        const usersCount = await fastify.prisma.user.count();
        user = await fastify.prisma.user.create({
          data: {
            nickname,
            phone: normalizedPhone,
            passwordHash,
            avatarUrl,
            role: usersCount === 0 ? 'admin' : 'user',
          },
        });
      }
    } catch (error) {
      return reply.code(400).send({ error: handleUniqueError(error) });
    }

    try {
      const otp = await createPhoneOtp({
        phone: normalizedPhone,
        purpose: 'register_phone',
        userId: user.id,
      });

      await sendSms({
        to: normalizedPhone,
        message: `Код подтверждения Aeris: ${otp.code}. Никому не сообщайте его.`,
      });

      return reply.send({
        requiresOtp: true,
        phoneMasked: maskPhone(normalizedPhone),
        expiresInSec: fastify.appConfig.OTP_TTL_MINUTES * 60,
        ...(fastify.appConfig.NODE_ENV !== 'production' ? { debugOtpCode: otp.code } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'OTP_RESEND_TOO_EARLY') {
        return reply.code(429).send({
          error: `Код уже отправлен. Повторите через ${fastify.appConfig.OTP_RESEND_COOLDOWN_SECONDS} сек.`,
        });
      }

      if (error instanceof Error && error.message === 'TWILIO_CONFIG_MISSING') {
        return reply.code(500).send({ error: 'SMS-провайдер не настроен (TWILIO_CONFIG_MISSING)' });
      }

      return reply.code(500).send({ error: 'Не удалось отправить OTP' });
    }
  });

  fastify.post('/auth/register/verify-phone', async (request, reply) => {
    const parsed = verifyPhoneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректный OTP-код' });
    }

    const normalizedPhone = normalizePhone(parsed.data.phone);
    if (!normalizedPhone) {
      return reply.code(400).send({ error: 'Некорректный номер телефона' });
    }

    const ip = request.ip;
    if (!otpVerifyLimiter.consume(`otp-verify:ip:${ip}`) || !otpVerifyLimiter.consume(`otp-verify:phone:${normalizedPhone}`)) {
      return reply.code(429).send({ error: 'Слишком много попыток проверки кода' });
    }

    try {
      const verified = await verifyPhoneOtp({
        phone: normalizedPhone,
        purpose: 'register_phone',
        code: parsed.data.code,
      });

      const user = verified.userId
        ? await fastify.prisma.user.findFirst({
            where: {
              id: verified.userId,
              phone: normalizedPhone,
            },
          })
        : null;

      if (!user) {
        return reply.code(404).send({ error: 'Пользователь для этого OTP не найден' });
      }

      const updatedUser = await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
        },
      });

      const generalId = await ensureGeneralCommunity();
      await addUserToChat(generalId, user.id);

      const payload = await issueSessionReply({
        fastify,
        reply,
        user: {
          id: updatedUser.id,
          nickname: updatedUser.nickname,
          avatarUrl: updatedUser.avatarUrl,
          role: updatedUser.role,
          email: updatedUser.email,
          phone: updatedUser.phone,
          phoneVerifiedAt: updatedUser.phoneVerifiedAt,
        },
      });

      return reply.send(payload);
    } catch (error) {
      if (!(error instanceof Error)) {
        return reply.code(400).send({ error: 'Некорректный OTP-код' });
      }

      if (error.message === 'OTP_EXPIRED') {
        return reply.code(400).send({ error: 'Код истёк. Запросите новый OTP' });
      }
      if (error.message === 'OTP_ATTEMPTS_EXCEEDED') {
        return reply.code(429).send({ error: 'Превышено число попыток ввода OTP' });
      }
      if (error.message === 'OTP_NOT_FOUND' || error.message === 'OTP_INVALID') {
        return reply.code(400).send({ error: 'Неверный код' });
      }

      return reply.code(500).send({ error: 'Не удалось подтвердить номер' });
    }
  });

  fastify.post('/auth/register/resend-otp', async (request, reply) => {
    const parsed = resendPhoneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректный номер телефона' });
    }

    const normalizedPhone = normalizePhone(parsed.data.phone);
    if (!normalizedPhone) {
      return reply.code(400).send({ error: 'Некорректный номер телефона' });
    }

    const user = await fastify.prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (!user || user.phoneVerifiedAt) {
      return reply.code(404).send({ error: 'Нет незавершённой регистрации для этого номера' });
    }

    const ip = request.ip;
    if (!otpSendLimiter.consume(`otp-send:ip:${ip}`) || !otpSendLimiter.consume(`otp-send:phone:${normalizedPhone}`)) {
      return reply.code(429).send({ error: 'Слишком часто отправляете код' });
    }

    try {
      const otp = await createPhoneOtp({
        phone: normalizedPhone,
        purpose: 'register_phone',
        userId: user.id,
      });

      await sendSms({
        to: normalizedPhone,
        message: `Код подтверждения Aeris: ${otp.code}. Никому не сообщайте его.`,
      });

      return reply.send({
        ok: true,
        expiresInSec: fastify.appConfig.OTP_TTL_MINUTES * 60,
        ...(fastify.appConfig.NODE_ENV !== 'production' ? { debugOtpCode: otp.code } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'OTP_RESEND_TOO_EARLY') {
        return reply.code(429).send({
          error: `Код уже отправлен. Повторите через ${fastify.appConfig.OTP_RESEND_COOLDOWN_SECONDS} сек.`,
        });
      }

      return reply.code(500).send({ error: 'Не удалось отправить OTP' });
    }
  });

  fastify.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные данные входа' });
    }

    const ip = request.ip;
    if (!authLimiter.consume(`login:ip:${ip}`)) {
      return reply.code(429).send({ error: 'Слишком много попыток входа' });
    }

    const identifier = parsed.data.identifier.trim();
    let user: DbUser | null = null;

    if (identifier.includes('@')) {
      user = await fastify.prisma.user.findUnique({ where: { email: normalizeEmail(identifier) } });
    } else if (isPhoneCandidate(identifier)) {
      const phone = normalizePhone(identifier);
      if (phone) {
        user = await fastify.prisma.user.findUnique({ where: { phone } });
      }
    }

    if (!user) {
      user = await fastify.prisma.user.findUnique({ where: { nickname: sanitizeNickname(identifier) } });
    }

    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }

    if (user.phone && !user.phoneVerifiedAt) {
      return reply.code(403).send({ error: 'Телефон не подтверждён. Завершите OTP-подтверждение.' });
    }

    const validPassword = await verifyPassword(user.passwordHash, parsed.data.password);
    if (!validPassword) {
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }

    const payload = await issueSessionReply({
      fastify,
      reply,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        role: user.role,
        email: user.email,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
    });

    return reply.send(payload);
  });

  fastify.post('/auth/join', async (request, reply) => {
    const body = joinSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Некорректные данные' });
    }

    const invite = await fastify.prisma.invite.findUnique({ where: { code: body.data.code } });
    if (!invite || invite.uses >= invite.maxUses) {
      return reply.code(400).send({ error: 'Инвайт недействителен или исчерпан' });
    }

    const nickname = sanitizeNickname(body.data.nickname);
    if (nickname.length < 2) {
      return reply.code(400).send({ error: 'Слишком короткий ник' });
    }

    let user: DbUser;
    try {
      const usersCount = await fastify.prisma.user.count();
      user = await fastify.prisma.user.create({
        data: {
          nickname,
          avatarUrl: body.data.avatarUrl || null,
          role: usersCount === 0 ? 'admin' : 'user',
        },
      });
    } catch (error) {
      return reply.code(400).send({ error: handleUniqueError(error) });
    }

    await fastify.prisma.invite.update({
      where: { code: invite.code },
      data: {
        uses: {
          increment: 1,
        },
        usedAt: new Date(),
        usedByUserId: user.id,
      },
    });

    const defaultCommunityId = invite.defaultCommunityId || fastify.appConfig.INVITE_DEFAULT_COMMUNITY_ID;
    if (defaultCommunityId) {
      await addUserToChat(defaultCommunityId, user.id).catch(() => undefined);
    } else {
      const generalId = await ensureGeneralCommunity();
      await addUserToChat(generalId, user.id);
    }

    const payload = await issueSessionReply({
      fastify,
      reply,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        role: user.role,
        email: user.email,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
    });

    return reply.send(payload);
  });

  fastify.get('/me', async (request, reply) => {
    const authUser = await fastify.resolveAuthUser(request);
    if (!authUser) {
      return reply.code(401).send({ error: 'Не авторизован' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        role: true,
        email: true,
        phone: true,
        phoneVerifiedAt: true,
      },
    });

    if (!user) {
      return reply.code(401).send({ error: 'Не авторизован' });
    }

    return reply.send({
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        role: user.role,
        email: user.email,
        phone: user.phone,
        phoneVerified: Boolean(user.phoneVerifiedAt),
      },
      csrfToken: createCsrfToken(authUser.sessionId),
    });
  });

  fastify.post('/auth/logout', async (request, reply) => {
    const authUser = await fastify.resolveAuthUser(request);
    const cookieSessionId = request.cookies[fastify.appConfig.SESSION_COOKIE_NAME];
    const headerSession =
      fastify.appConfig.NODE_ENV !== 'production' ? request.headers['x-guest-token'] : undefined;
    const headerSessionId = typeof headerSession === 'string' ? headerSession : undefined;

    const sessionIds = new Set<string>();
    if (cookieSessionId) {
      sessionIds.add(cookieSessionId);
    }
    if (headerSessionId) {
      sessionIds.add(headerSessionId);
    }
    if (authUser?.sessionId) {
      sessionIds.add(authUser.sessionId);
    }

    const orFilters: Array<{ id?: string; userId?: string }> = [];
    for (const id of sessionIds) {
      orFilters.push({ id });
    }
    if (authUser?.id) {
      orFilters.push({ userId: authUser.id });
    }

    if (orFilters.length > 0) {
      await fastify.prisma.session.deleteMany({
        where: {
          OR: orFilters,
        },
      });
    }

    clearSessionCookie(reply);

    return reply.send({ ok: true });
  });
};
