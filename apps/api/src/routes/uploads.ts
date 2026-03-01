import type { FastifyPluginAsync } from 'fastify';

import { requireAuth } from '../lib/auth.js';
import { verifyCsrfToken } from '../lib/csrf.js';
import { storeImage } from '../lib/uploadService.js';

export const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/uploads/image', { preHandler: requireAuth }, async (request, reply) => {
    const authUser = request.authUser!;
    const csrf = request.headers['x-csrf-token'];

    if (!verifyCsrfToken(authUser.sessionId, typeof csrf === 'string' ? csrf : undefined)) {
      return reply.code(403).send({ error: 'CSRF токен невалиден' });
    }

    const file = await request.file({
      limits: {
        fileSize: fastify.config.MAX_IMAGE_SIZE_MB * 1024 * 1024,
      },
    });

    if (!file) {
      return reply.code(400).send({ error: 'Файл не найден' });
    }

    if (!file.mimetype.startsWith('image/')) {
      return reply.code(400).send({ error: 'Нужен image/* файл' });
    }

    const buffer = await file.toBuffer();
    const stored = await storeImage({
      buffer,
      originalName: file.filename,
      mimeType: file.mimetype,
    });

    const image = await fastify.prisma.image.create({
      data: {
        uploaderId: authUser.id,
        mimeType: file.mimetype,
        width: stored.width,
        height: stored.height,
        originalPath: stored.originalPath,
        thumbPath: stored.thumbPath,
      },
    });

    return reply.send({ image });
  });
};
