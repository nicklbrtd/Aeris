import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../env.js';
import { prisma } from './prisma.js';

export type OtpPurpose = 'register_phone';

function hashOtp(code: string): string {
  return createHmac('sha256', env.OTP_SECRET).update(code).digest('hex');
}

function randomCode(): string {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function createPhoneOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  userId: string;
}): Promise<{ code: string; expiresAt: Date }> {
  const recent = await prisma.otpCode.findFirst({
    where: {
      phone: params.phone,
      purpose: params.purpose,
      consumedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (recent) {
    const elapsedSec = Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
    if (elapsedSec < env.OTP_RESEND_COOLDOWN_SECONDS) {
      throw new Error('OTP_RESEND_TOO_EARLY');
    }
  }

  const code = randomCode();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: {
      phone: params.phone,
      purpose: params.purpose,
      userId: params.userId,
      codeHash: hashOtp(code),
      expiresAt,
    },
  });

  return { code, expiresAt };
}

export async function verifyPhoneOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ userId: string | null }> {
  const otp = await prisma.otpCode.findFirst({
    where: {
      phone: params.phone,
      purpose: params.purpose,
      consumedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!otp) {
    throw new Error('OTP_NOT_FOUND');
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    throw new Error('OTP_EXPIRED');
  }

  if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw new Error('OTP_ATTEMPTS_EXCEEDED');
  }

  const expected = Buffer.from(otp.codeHash);
  const actual = Buffer.from(hashOtp(params.code));
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!valid) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
    throw new Error('OTP_INVALID');
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: {
      consumedAt: new Date(),
    },
  });

  return { userId: otp.userId };
}
