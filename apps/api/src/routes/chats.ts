import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAuth, requireAdmin } from '../lib/auth.js';
import { addUserToChat } from '../lib/chatService.js';
import { createCsrfToken, verifyCsrfToken } from '../lib/csrf.js';

const createChatSchema = z.object({
  type: z.enum(['dm', 'community']),
  title: z.string().min(2).max(80).optional(),
  memberUserId: z.string().optional(),
});

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/chats', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.id;

    const members = await fastify.prisma.chatMember.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    nickname: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: {
                    id: true,
                    nickname: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        chat: {
          createdAt: 'desc',
        },
      },
    });

    const chats = members.map((member) => {
      const chat = member.chat;
      const lastMessage = chat.messages[0] ?? null;

      let title = chat.title ?? 'Личный чат';
      let avatarUrl: string | null = null;

      if (chat.type === 'dm') {
        const target = chat.members.find((m) => m.userId !== userId)?.user;
        if (target) {
          title = target.nickname;
          avatarUrl = target.avatarUrl;
        }
      }

      return {
        id: chat.id,
        type: chat.type,
        title,
        avatarUrl,
        lastMessage,
        membersCount: chat.members.length,
      };
    });

    return reply.send({ chats, csrfToken: createCsrfToken(request.authUser!.sessionId) });
  });

  fastify.post('/chats', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    const body = createChatSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Некорректные данные' });
    }

    if (body.data.type === 'community') {
      if (!requireAdmin(request, reply)) {
        return;
      }

      const chat = await fastify.prisma.chat.create({
        data: {
          type: 'community',
          title: body.data.title ?? 'Новое сообщество',
          members: {
            create: {
              userId: authUser.id,
            },
          },
        },
      });

      return reply.send({ chat });
    }

    if (!body.data.memberUserId) {
      return reply.code(400).send({ error: 'Нужен userId для DM' });
    }

    const [a, b] = [authUser.id, body.data.memberUserId].sort();
    const existing = await fastify.prisma.chat.findFirst({
      where: {
        type: 'dm',
        AND: [
          { members: { some: { userId: a } } },
          { members: { some: { userId: b } } },
        ],
      },
    });

    if (existing) {
      await addUserToChat(existing.id, authUser.id);
      await addUserToChat(existing.id, body.data.memberUserId);
      return reply.send({ chat: existing });
    }

    const chat = await fastify.prisma.chat.create({
      data: {
        type: 'dm',
        members: {
          createMany: {
            data: [{ userId: authUser.id }, { userId: body.data.memberUserId }],
            skipDuplicates: true,
          },
        },
      },
    });

    return reply.send({ chat });
  });

  fastify.get('/chats/:id/messages', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const params = z.object({ id: z.string() }).safeParse(request.params);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(40),
      })
      .safeParse(request.query);

    if (!params.success || !query.success) {
      return reply.code(400).send({ error: 'Некорректный запрос' });
    }

    const membership = await fastify.prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId: params.data.id,
          userId: authUser.id,
        },
      },
    });

    if (!membership) {
      return reply.code(403).send({ error: 'Нет доступа к чату' });
    }

    const messages = await fastify.prisma.message.findMany({
      where: { chatId: params.data.id },
      orderBy: { createdAt: 'desc' },
      take: query.data.limit,
      ...(query.data.cursor
        ? {
            cursor: { id: query.data.cursor },
            skip: 1,
          }
        : {}),
      include: {
        sender: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        image: true,
      },
    });

    return reply.send({
      items: messages.reverse(),
      nextCursor: messages.length === query.data.limit ? messages[messages.length - 1]?.id : null,
    });
  });
};
