import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../lib/auth.js';
import { createMessage, ensureChatMembership } from '../lib/chatService.js';
import { verifyCsrfToken } from '../lib/csrf.js';
import { messageLimiter } from '../lib/rateLimiter.js';

const schema = z.object({
  chatId: z.string(),
  type: z.enum(['text', 'image']).default('text'),
  text: z.string().optional(),
  imageId: z.string().optional(),
});

export const messageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/messages', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные данные' });
    }

    const ip = request.ip;
    const allow = messageLimiter.consume(`rest:user:${authUser.id}`) && messageLimiter.consume(`rest:ip:${ip}`);
    if (!allow) {
      return reply.code(429).send({ error: 'Слишком много сообщений' });
    }

    const allowed = await ensureChatMembership(parsed.data.chatId, authUser.id);
    if (!allowed) {
      return reply.code(403).send({ error: 'Нет доступа к чату' });
    }

    try {
      const message = await createMessage({
        chatId: parsed.data.chatId,
        senderId: authUser.id,
        type: parsed.data.type,
        text: parsed.data.text,
        imageId: parsed.data.imageId,
      });

      fastify.io.to(`chat:${parsed.data.chatId}`).emit('message:new', message);

      return reply.send({ message });
    } catch {
      return reply.code(400).send({ error: 'Пустое сообщение' });
    }
  });
};
