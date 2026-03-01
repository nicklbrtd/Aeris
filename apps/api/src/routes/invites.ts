import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAuth, requireAdmin } from '../lib/auth.js';
import { verifyCsrfToken } from '../lib/csrf.js';

const createInviteSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]{4,64}$/)
    .optional(),
  maxUses: z.coerce.number().min(1).max(10000).default(1),
  defaultCommunityId: z.string().optional(),
});

function randomCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export const inviteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/invites', { preHandler: requireAuth }, async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    const parsed = createInviteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные параметры инвайта' });
    }

    const code = parsed.data.code ?? randomCode();

    const invite = await fastify.prisma.invite.create({
      data: {
        code,
        maxUses: parsed.data.maxUses,
        createdByUserId: authUser.id,
        defaultCommunityId: parsed.data.defaultCommunityId,
      },
    });

    return reply.send({
      invite,
      inviteLink: `${fastify.appConfig.WEB_ORIGIN}/join?code=${invite.code}`,
    });
  });
};
