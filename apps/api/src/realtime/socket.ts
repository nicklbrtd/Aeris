import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';

import { createMessage, ensureChatMembership } from '../lib/chatService.js';
import { messageLimiter } from '../lib/rateLimiter.js';
import { sanitizeMessageText } from '../lib/sanitize.js';

function readCookieValue(cookieHeader: string | undefined, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === key) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

export function setupSocket(fastify: FastifyInstance): Server {
  const io = new Server(fastify.server, {
    path: '/socket.io',
    cors: {
      origin: fastify.appConfig.WEB_ORIGIN,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    const sessionId = readCookieValue(cookieHeader, fastify.appConfig.SESSION_COOKIE_NAME);
    const guestToken =
      fastify.appConfig.NODE_ENV !== 'production' ? socket.handshake.auth?.guestToken : undefined;
    const candidate = sessionId || (typeof guestToken === 'string' && guestToken ? guestToken : null);

    if (!candidate) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    const session = await fastify.prisma.session.findUnique({
      where: { id: candidate },
      include: { user: true },
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      next(new Error('UNAUTHORIZED'));
      return;
    }

    (socket.data as { userId: string; nickname: string }).userId = session.user.id;
    (socket.data as { userId: string; nickname: string }).nickname = session.user.nickname;

    next();
  });

  io.on('connection', (socket) => {
    socket.on('chat:join', async (chatId: string) => {
      const userId = (socket.data as { userId: string }).userId;
      const allowed = await ensureChatMembership(chatId, userId);
      if (!allowed) {
        socket.emit('error:chat', { chatId, reason: 'FORBIDDEN' });
        return;
      }
      socket.join(`chat:${chatId}`);
    });

    socket.on('typing:start', async (payload: { chatId: string }) => {
      const userId = (socket.data as { userId: string }).userId;
      const allowed = await ensureChatMembership(payload.chatId, userId);
      if (!allowed) {
        return;
      }
      socket.to(`chat:${payload.chatId}`).emit('typing:start', {
        chatId: payload.chatId,
        userId,
      });
    });

    socket.on('typing:stop', async (payload: { chatId: string }) => {
      const userId = (socket.data as { userId: string }).userId;
      const allowed = await ensureChatMembership(payload.chatId, userId);
      if (!allowed) {
        return;
      }
      socket.to(`chat:${payload.chatId}`).emit('typing:stop', {
        chatId: payload.chatId,
        userId,
      });
    });

    socket.on(
      'message:send',
      async (payload: { chatId: string; clientId: string; type: 'text' | 'image'; text?: string; imageId?: string }) => {
        const userId = (socket.data as { userId: string }).userId;
        const ip = socket.handshake.address || 'unknown';

        const allowedRate =
          messageLimiter.consume(`ws:user:${userId}`) && messageLimiter.consume(`ws:ip:${ip}`);
        if (!allowedRate) {
          socket.emit('message:error', { clientId: payload.clientId, error: 'RATE_LIMIT' });
          return;
        }

        const allowed = await ensureChatMembership(payload.chatId, userId);
        if (!allowed) {
          socket.emit('message:error', { clientId: payload.clientId, error: 'FORBIDDEN' });
          return;
        }

        try {
          const message = await createMessage({
            chatId: payload.chatId,
            senderId: userId,
            type: payload.type,
            text: sanitizeMessageText(payload.text ?? ''),
            imageId: payload.imageId,
          });

          io.to(`chat:${payload.chatId}`).emit('message:new', {
            ...message,
            clientId: payload.clientId,
          });
        } catch {
          socket.emit('message:error', { clientId: payload.clientId, error: 'INVALID_MESSAGE' });
        }
      },
    );
  });

  return io;
}
