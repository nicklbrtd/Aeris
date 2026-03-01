import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAuth, clearSessionCookie } from '../lib/auth.js';
import { createCsrfToken, verifyCsrfToken } from '../lib/csrf.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { authLimiter } from '../lib/rateLimiter.js';
import { sanitizeNickname } from '../lib/sanitize.js';

const visibilitySchema = z.enum(['everyone', 'contacts', 'nobody']);
const dmSchema = z.enum(['everyone', 'members', 'nobody']);

const profileSchema = z.object({
  nickname: z.string().min(2).max(40).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(240).nullable().optional(),
});

const privacySchema = z.object({
  profileVisibility: visibilitySchema.optional(),
  lastSeenVisibility: visibilitySchema.optional(),
  readReceiptsEnabled: z.boolean().optional(),
  typingStatusEnabled: z.boolean().optional(),
  allowDmFrom: dmSchema.optional(),
  discoverByEmail: z.boolean().optional(),
  discoverByPhone: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
});

const notificationsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(128).optional(),
  confirm: z.literal('DELETE'),
});

function requireValidCsrf(request: FastifyRequest, reply: FastifyReply): boolean {
  const authUser = request.authUser;
  if (!authUser) {
    reply.code(401).send({ error: 'Не авторизован' });
    return false;
  }

  const csrf = request.headers['x-csrf-token'];
  if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
    reply.code(403).send({ error: 'CSRF токен невалиден' });
    return false;
  }

  return true;
}

function toSettingsPayload(user: {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  role: 'admin' | 'user';
  profileVisibility: string;
  lastSeenVisibility: string;
  readReceiptsEnabled: boolean;
  typingStatusEnabled: boolean;
  allowDmFrom: string;
  discoverByEmail: boolean;
  discoverByPhone: boolean;
  securityAlerts: boolean;
  pushEnabled: boolean;
  emailNotifications: boolean;
  marketingOptIn: boolean;
  createdAt: Date;
}) {
  return {
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      email: user.email,
      phone: user.phone,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      role: user.role,
      createdAt: user.createdAt,
    },
    privacy: {
      profileVisibility: user.profileVisibility,
      lastSeenVisibility: user.lastSeenVisibility,
      readReceiptsEnabled: user.readReceiptsEnabled,
      typingStatusEnabled: user.typingStatusEnabled,
      allowDmFrom: user.allowDmFrom,
      discoverByEmail: user.discoverByEmail,
      discoverByPhone: user.discoverByPhone,
      securityAlerts: user.securityAlerts,
    },
    notifications: {
      pushEnabled: user.pushEnabled,
      emailNotifications: user.emailNotifications,
      marketingOptIn: user.marketingOptIn,
    },
  };
}

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/me/settings', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;

    const user = await fastify.prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        bio: true,
        email: true,
        phone: true,
        phoneVerifiedAt: true,
        role: true,
        profileVisibility: true,
        lastSeenVisibility: true,
        readReceiptsEnabled: true,
        typingStatusEnabled: true,
        allowDmFrom: true,
        discoverByEmail: true,
        discoverByPhone: true,
        securityAlerts: true,
        pushEnabled: true,
        emailNotifications: true,
        marketingOptIn: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }

    const sessionsCount = await fastify.prisma.session.count({ where: { userId: authUser.id } });

    return reply.send({
      ...toSettingsPayload(user),
      sessionsCount,
      csrfToken: createCsrfToken(authUser.sessionId),
    });
  });

  fastify.patch('/me/profile', { preHandler: requireAuth }, async (request, reply) => {
    if (!requireValidCsrf(request, reply)) {
      return;
    }

    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные данные профиля' });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.nickname !== undefined) {
      const nickname = sanitizeNickname(parsed.data.nickname);
      if (nickname.length < 2) {
        return reply.code(400).send({ error: 'Слишком короткий ник' });
      }
      data.nickname = nickname;
    }
    if (parsed.data.avatarUrl !== undefined) {
      data.avatarUrl = parsed.data.avatarUrl || null;
    }
    if (parsed.data.bio !== undefined) {
      data.bio = parsed.data.bio?.trim() || null;
    }

    try {
      await fastify.prisma.user.update({
        where: { id: request.authUser!.id },
        data,
      });
      return reply.send({ ok: true });
    } catch {
      return reply.code(400).send({ error: 'Ник уже занят или данные невалидны' });
    }
  });

  fastify.patch('/me/privacy', { preHandler: requireAuth }, async (request, reply) => {
    if (!requireValidCsrf(request, reply)) {
      return;
    }

    const parsed = privacySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные настройки приватности' });
    }

    await fastify.prisma.user.update({
      where: { id: request.authUser!.id },
      data: parsed.data,
    });

    return reply.send({ ok: true });
  });

  fastify.patch('/me/notifications', { preHandler: requireAuth }, async (request, reply) => {
    if (!requireValidCsrf(request, reply)) {
      return;
    }

    const parsed = notificationsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные настройки уведомлений' });
    }

    await fastify.prisma.user.update({
      where: { id: request.authUser!.id },
      data: parsed.data,
    });

    return reply.send({ ok: true });
  });

  fastify.patch('/me/password', { preHandler: requireAuth }, async (request, reply) => {
    if (!requireValidCsrf(request, reply)) {
      return;
    }

    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные данные пароля' });
    }

    const ip = request.ip;
    if (!authLimiter.consume(`password-change:${request.authUser!.id}`) || !authLimiter.consume(`password-change-ip:${ip}`)) {
      return reply.code(429).send({ error: 'Слишком много попыток смены пароля' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.authUser!.id },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      return reply.code(400).send({ error: 'Для этого аккаунта пароль ещё не настроен' });
    }

    const valid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
    if (!valid) {
      return reply.code(401).send({ error: 'Текущий пароль неверный' });
    }

    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return reply.code(400).send({ error: 'Новый пароль должен отличаться' });
    }

    const nextHash = await hashPassword(parsed.data.newPassword);
    await fastify.prisma.user.update({
      where: { id: request.authUser!.id },
      data: { passwordHash: nextHash },
    });

    return reply.send({ ok: true });
  });

  fastify.post('/me/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    if (!requireValidCsrf(request, reply)) {
      return;
    }

    await fastify.prisma.session.deleteMany({
      where: { userId: request.authUser!.id },
    });

    clearSessionCookie(reply);

    return reply.send({ ok: true });
  });

  fastify.get('/me/data-export', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;

    const [messagesCount, chatsCount, imagesCount, user] = await Promise.all([
      fastify.prisma.message.count({ where: { senderId: authUser.id } }),
      fastify.prisma.chatMember.count({ where: { userId: authUser.id } }),
      fastify.prisma.image.count({ where: { uploaderId: authUser.id } }),
      fastify.prisma.user.findUnique({
        where: { id: authUser.id },
        select: {
          id: true,
          nickname: true,
          email: true,
          phone: true,
          createdAt: true,
          avatarUrl: true,
          bio: true,
        },
      }),
    ]);

    if (!user) {
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }

    return reply.send({
      generatedAt: new Date().toISOString(),
      profile: user,
      stats: {
        chatsCount,
        messagesCount,
        imagesCount,
      },
      note: 'MVP export: агрегированная сводка. Полный экспорт диалогов — TODO.',
    });
  });

  fastify.delete('/me', { preHandler: requireAuth }, async (request, reply) => {
    if (!requireValidCsrf(request, reply)) {
      return;
    }

    const parsed = deleteAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректное подтверждение удаления' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.authUser!.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }

    if (user.passwordHash) {
      if (!parsed.data.password) {
        return reply.code(400).send({ error: 'Введите пароль для удаления аккаунта' });
      }
      const valid = await verifyPassword(user.passwordHash, parsed.data.password);
      if (!valid) {
        return reply.code(401).send({ error: 'Пароль неверный' });
      }
    }

    await fastify.prisma.user.delete({ where: { id: user.id } });
    clearSessionCookie(reply);

    return reply.send({ ok: true });
  });
};
