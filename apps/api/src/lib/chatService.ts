import { Prisma, type MessageType } from '@prisma/client';

import { prisma } from './prisma.js';
import { sanitizeMessageText } from './sanitize.js';

export async function ensureGeneralCommunity(): Promise<string> {
  const existing = await prisma.chat.findFirst({
    where: {
      type: 'community',
      title: 'Общий',
    },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.chat.create({
    data: {
      type: 'community',
      title: 'Общий',
    },
  });

  return created.id;
}

export async function addUserToChat(chatId: string, userId: string): Promise<void> {
  await prisma.chatMember.upsert({
    where: {
      chatId_userId: {
        chatId,
        userId,
      },
    },
    update: {},
    create: {
      chatId,
      userId,
    },
  });
}

export async function ensureChatMembership(chatId: string, userId: string): Promise<boolean> {
  const membership = await prisma.chatMember.findUnique({
    where: {
      chatId_userId: {
        chatId,
        userId,
      },
    },
  });

  return Boolean(membership);
}

export async function createMessage(params: {
  chatId: string;
  senderId: string;
  type: MessageType;
  text?: string;
  imageId?: string;
}) {
  const safeText = params.type === 'text' ? sanitizeMessageText(params.text ?? '') : undefined;
  if (params.type === 'text' && !safeText) {
    throw new Error('EMPTY_MESSAGE');
  }
  if (params.type === 'image' && !params.imageId) {
    throw new Error('IMAGE_REQUIRED');
  }

  const message = await prisma.message.create({
    data: {
      chatId: params.chatId,
      senderId: params.senderId,
      type: params.type,
      text: safeText,
      imageId: params.imageId,
    },
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

  return message;
}

export const messageSelect = Prisma.validator<Prisma.MessageDefaultArgs>()({
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
