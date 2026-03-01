import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAuth } from '../lib/auth.js';

const searchSchema = z.object({
  q: z.string().min(2).max(40),
  limit: z.coerce.number().min(1).max(20).default(10),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/users/search', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const parsed = searchSchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректный поисковый запрос' });
    }

    const users = await fastify.prisma.user.findMany({
      where: {
        id: { not: authUser.id },
        nickname: {
          contains: parsed.data.q.trim(),
        },
        profileVisibility: {
          not: 'nobody',
        },
      },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        bio: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: parsed.data.limit,
    });

    return reply.send({ users });
  });
};
