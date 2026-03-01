import type { FastifyPluginAsync } from 'fastify';

import { requireAuth } from '../lib/auth.js';
import { verifyCsrfToken } from '../lib/csrf.js';

export const pushRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/push/subscribe', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    // TODO: сохранить push subscription и отправлять уведомления через web-push + VAPID.
    return reply.code(501).send({
      error: 'PUSH_NOT_IMPLEMENTED',
      message: 'Push scaffolding готов, реализация будет в следующей фазе.',
    });
  });
};
