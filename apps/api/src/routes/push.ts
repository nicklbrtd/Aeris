import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../lib/auth.js';
import { verifyCsrfToken } from '../lib/csrf.js';

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

export const pushRoutes: FastifyPluginAsync = async (fastify) => {
  const pushModel = (fastify.prisma as unknown as { pushSubscription: any }).pushSubscription;

  fastify.get('/push/public-key', async (_request, reply) => {
    if (!fastify.appConfig.VAPID_PUBLIC_KEY) {
      return reply.code(503).send({ error: 'VAPID_NOT_CONFIGURED' });
    }

    return reply.send({ publicKey: fastify.appConfig.VAPID_PUBLIC_KEY });
  });

  fastify.post('/push/subscribe', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    const parsed = subscriptionSchema.safeParse((request.body as { subscription?: unknown })?.subscription);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректная push-подписка' });
    }

    const expirationTime =
      typeof parsed.data.expirationTime === 'number' ? new Date(parsed.data.expirationTime) : null;

    await pushModel.upsert({
      where: {
        endpoint: parsed.data.endpoint,
      },
      update: {
        userId: authUser.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        expirationTime,
      },
      create: {
        userId: authUser.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        expirationTime,
      },
    });

    await fastify.prisma.user.update({
      where: { id: authUser.id },
      data: { pushEnabled: true },
    });

    return reply.send({ ok: true });
  });

  fastify.post('/push/unsubscribe', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    const parsed = unsubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные данные отписки' });
    }

    await pushModel.deleteMany({
      where: {
        userId: authUser.id,
        endpoint: parsed.data.endpoint,
      },
    });

    const hasAny = await pushModel.count({
      where: { userId: authUser.id },
    });

    if (!hasAny) {
      await fastify.prisma.user.update({
        where: { id: authUser.id },
        data: { pushEnabled: false },
      });
    }

    return reply.send({ ok: true });
  });
};
