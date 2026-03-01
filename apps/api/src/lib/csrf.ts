import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../env.js';

function buildRaw(sessionId: string): string {
  return createHmac('sha256', env.CSRF_SECRET).update(sessionId).digest('hex');
}

export function createCsrfToken(sessionId: string): string {
  return buildRaw(sessionId);
}

export function verifyCsrfToken(sessionId: string, token?: string): boolean {
  if (!token) {
    return false;
  }

  const expected = buildRaw(sessionId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
