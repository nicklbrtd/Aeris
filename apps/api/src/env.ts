import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  WEB_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().default('file:./dev.db'),
  SESSION_COOKIE_NAME: z.string().default('mfs_session'),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  SESSION_SECRET: z.string().min(16),
  CSRF_SECRET: z.string().min(16),
  UPLOADS_DIR: z.string().default('./uploads'),
  MAX_IMAGE_SIZE_MB: z.coerce.number().default(10),
  INVITE_DEFAULT_COMMUNITY_ID: z.string().optional(),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  OTP_SECRET: z.string().min(16),
  OTP_TTL_MINUTES: z.coerce.number().min(1).max(60).default(10),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().min(15).max(600).default(45),
  OTP_MAX_ATTEMPTS: z.coerce.number().min(3).max(15).default(5),
  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  NEXT_PUBLIC_ENABLE_DEV_GUEST_TOKEN: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Ошибка env переменных:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
