import { resolve } from 'node:path';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import Fastify from 'fastify';

import { env } from './env.js';
import { resolveAuthUser } from './lib/auth.js';
import { prisma } from './lib/prisma.js';
import { ensureUploadDirs } from './lib/uploadService.js';
import { setupSocket } from './realtime/socket.js';
import { authRoutes } from './routes/auth.js';
import { chatRoutes } from './routes/chats.js';
import { inviteRoutes } from './routes/invites.js';
import { messageRoutes } from './routes/messages.js';
import { pushRoutes } from './routes/push.js';
import { uploadRoutes } from './routes/uploads.js';

const fastify = Fastify({
  logger: {
    level: 'info',
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          ip: req.ip,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  },
});

fastify.decorate('prisma', prisma);
fastify.decorate('resolveAuthUser', resolveAuthUser);
fastify.decorate('config', env);

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
    resolveAuthUser: typeof resolveAuthUser;
    config: typeof env;
    io: ReturnType<typeof setupSocket>;
  }
}

async function main(): Promise<void> {
  await ensureUploadDirs();

  await fastify.register(cookie, {
    secret: env.SESSION_SECRET,
  });

  await fastify.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await fastify.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  await fastify.register(multipart, {
    attachFieldsToBody: false,
  });

  await fastify.register(staticPlugin, {
    root: resolve(process.cwd(), env.UPLOADS_DIR),
    prefix: '/uploads/',
    decorateReply: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=60');
    },
  });

  await fastify.get('/health', async () => ({ ok: true }));

  await fastify.register(authRoutes);
  await fastify.register(chatRoutes);
  await fastify.register(messageRoutes);
  await fastify.register(uploadRoutes);
  await fastify.register(inviteRoutes);
  await fastify.register(pushRoutes);

  fastify.io = setupSocket(fastify);

  await fastify.listen({
    port: env.API_PORT,
    host: '0.0.0.0',
  });

  fastify.log.info(`API запущен на :${env.API_PORT}`);
}

main().catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
