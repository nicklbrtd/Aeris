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

    const chats = members.map((member: (typeof members)[number]) => {
      const chat = member.chat;
      const lastMessage = chat.messages[0] ?? null;

      let title = chat.title ?? 'Личный чат';
      let avatarUrl: string | null = null;

      if (chat.type === 'dm') {
        const target = chat.members.find((m: (typeof chat.members)[number]) => m.userId !== userId)?.user;
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
    if (body.data.memberUserId === authUser.id) {
      return reply.code(400).send({ error: 'Нельзя создать чат с самим собой' });
    }

    const targetUser = await fastify.prisma.user.findUnique({
      where: { id: body.data.memberUserId },
      select: { id: true, allowDmFrom: true },
    });
    if (!targetUser) {
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }

    if (targetUser.allowDmFrom === 'nobody') {
      return reply.code(403).send({ error: 'Этот пользователь запретил личные сообщения' });
    }
    if (targetUser.allowDmFrom === 'members') {
      const hasSharedChat = await fastify.prisma.chatMember.count({
        where: {
          userId: authUser.id,
          chat: {
            members: {
              some: {
                userId: targetUser.id,
              },
            },
          },
        },
      });
      if (!hasSharedChat) {
        return reply.code(403).send({ error: 'Личные сообщения доступны только участникам общих чатов' });
      }
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
          create: [{ userId: authUser.id }, { userId: body.data.memberUserId }],
        },
      },
    });

    return reply.send({ chat });
  });

  fastify.get('/communities', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.authUser!.id;

    const communities = await fastify.prisma.chat.findMany({
      where: { type: 'community' },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            members: true,
          },
        },
        members: {
          where: { userId },
          select: { userId: true },
        },
      },
    });

    return reply.send({
      communities: communities.map((community) => ({
        id: community.id,
        title: community.title ?? 'Сообщество',
        membersCount: community._count.members,
        joined: community.members.length > 0,
      })),
      csrfToken: createCsrfToken(request.authUser!.sessionId),
    });
  });

  fastify.post('/communities/:id/join', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];
    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    const params = z.object({ id: z.string() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Некорректный id сообщества' });
    }

    const community = await fastify.prisma.chat.findFirst({
      where: {
        id: params.data.id,
        type: 'community',
      },
      select: {
        id: true,
      },
    });

    if (!community) {
      return reply.code(404).send({ error: 'Сообщество не найдено' });
    }

    await fastify.prisma.chatMember.upsert({
      where: {
        chatId_userId: {
          chatId: params.data.id,
          userId: authUser.id,
        },
      },
      update: {},
      create: {
        chatId: params.data.id,
        userId: authUser.id,
      },
    });

    return reply.send({ ok: true, chatId: params.data.id });
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
