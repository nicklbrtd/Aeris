import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const full = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (full) {
    return full.split('=')[1];
  }

  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) {
    return process.argv[idx + 1];
  }

  return undefined;
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function main(): Promise<void> {
  const code = getArg('code') ?? randomCode();
  const maxUses = Number(getArg('maxUses') ?? '1');
  const defaultCommunityId = getArg('communityId');

  const invite = await prisma.invite.create({
    data: {
      code,
      maxUses,
      defaultCommunityId: defaultCommunityId ?? null,
    },
  });

  console.log(`Создан инвайт: ${invite.code} (maxUses=${invite.maxUses})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
