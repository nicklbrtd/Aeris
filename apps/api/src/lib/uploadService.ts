import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import sharp from 'sharp';

import { env } from '../env.js';
import { safeFileName } from './sanitize.js';

const uploadsRoot = resolve(process.cwd(), env.UPLOADS_DIR);
const originalsDir = join(uploadsRoot, 'originals');
const thumbsDir = join(uploadsRoot, 'thumbs');

export async function ensureUploadDirs(): Promise<void> {
  await mkdir(originalsDir, { recursive: true });
  await mkdir(thumbsDir, { recursive: true });
}

export async function storeImage(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}): Promise<{ originalPath: string; thumbPath: string; width: number; height: number }> {
  const id = randomUUID();
  const safeName = safeFileName(params.originalName || 'image.jpg');
  const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')) : '.jpg';

  const originalFile = `${id}${ext}`;
  const thumbFile = `${id}.webp`;

  const originalAbs = join(originalsDir, originalFile);
  const thumbAbs = join(thumbsDir, thumbFile);

  const meta = await sharp(params.buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  await writeFile(originalAbs, params.buffer);
  await sharp(params.buffer)
    .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(thumbAbs);

  return {
    originalPath: `/uploads/originals/${originalFile}`,
    thumbPath: `/uploads/thumbs/${thumbFile}`,
    width,
    height,
  };
}
