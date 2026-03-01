import type { FastifyReply, FastifyRequest } from 'fastify';

import { env, isProd } from '../env.js';
import { prisma } from './prisma.js';

export type AuthUser = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  role: 'admin' | 'user';
  sessionId: string;
};

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
    },
  });

  return session.id;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(env.SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
  });
}

export async function resolveAuthUser(request: FastifyRequest): Promise<AuthUser | null> {
  const cookieSession = request.cookies[env.SESSION_COOKIE_NAME];
  const headerSession = request.headers['x-guest-token'];
  const candidateSessionId = cookieSession ?? (typeof headerSession === 'string' ? headerSession : undefined);

  if (!candidateSessionId) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: candidateSessionId },
    include: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return {
    id: session.user.id,
    nickname: session.user.nickname,
    avatarUrl: session.user.avatarUrl,
    role: session.user.role,
    sessionId: session.id,
  };
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authUser = await resolveAuthUser(request);
  if (!authUser) {
    reply.code(401).send({ error: 'Не авторизован' });
    return;
  }
  request.authUser = authUser;
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.authUser || request.authUser.role !== 'admin') {
    reply.code(403).send({ error: 'Доступ только для администратора' });
    return false;
  }
  return true;
}
