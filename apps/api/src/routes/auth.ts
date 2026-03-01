import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createSession, setSessionCookie, clearSessionCookie, requireAuth } from '../lib/auth.js';
import { ensureGeneralCommunity, addUserToChat } from '../lib/chatService.js';
import { createCsrfToken, verifyCsrfToken } from '../lib/csrf.js';
import { sanitizeNickname } from '../lib/sanitize.js';

const joinSchema = z.object({
  code: z.string().min(3).max(64),
  nickname: z.string().min(2).max(40),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
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

    const usersCount = await fastify.prisma.user.count();
    const user = await fastify.prisma.user.create({
      data: {
        nickname,
        avatarUrl: body.data.avatarUrl || null,
        role: usersCount === 0 ? 'admin' : 'user',
      },
    });

    const sessionId = await createSession(user.id);
    setSessionCookie(reply, sessionId);

    const fallbackGuestTokenEnabled = fastify.appConfig.NODE_ENV !== 'production';

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

    const csrfToken = createCsrfToken(sessionId);

    return reply.send({
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      },
      csrfToken,
      guestToken: fallbackGuestTokenEnabled ? sessionId : null,
    });
  });

  fastify.get('/me', async (request, reply) => {
    const authUser = await fastify.resolveAuthUser(request);
    if (!authUser) {
      return reply.code(401).send({ error: 'Не авторизован' });
    }

    return reply.send({
      user: {
        id: authUser.id,
        nickname: authUser.nickname,
        avatarUrl: authUser.avatarUrl,
        role: authUser.role,
      },
      csrfToken: createCsrfToken(authUser.sessionId),
    });
  });

  fastify.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    await fastify.prisma.session.deleteMany({ where: { id: authUser.sessionId } });
    clearSessionCookie(reply);

    return reply.send({ ok: true });
  });
};
