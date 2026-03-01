'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getChats, getMe } from '@/lib/api';
import { shortDateTime } from '@/lib/utils';
import type { Chat, User } from '@/lib/types';

export default function ChatsPage(): JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMe(), getChats()])
      .then(([meRes, chatsRes]) => {
        setMe(meRes.user);
        setChats(chatsRes.chats);
      })
      .catch(() => {
        router.replace('/join');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return <main className="min-h-screen p-6 text-muted">Загрузка чатов...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-28 pt-4">
      <header className="backdrop-glass sticky top-2 z-20 mb-4 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 shadow-glass">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Aeris</p>
          <h1 className="text-xl font-semibold text-text">Чаты</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/communities" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-text">
            Сообщества
          </Link>
          <Link href="/settings" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-text">
            Настройки
          </Link>
        </div>
      </header>

      {me ? <p className="mb-3 text-sm text-muted">Вы: {me.nickname}</p> : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface/80">
        {chats.length === 0 ? (
          <div className="p-6 text-sm text-muted">Пока нет чатов. Попросите администратора добавить вас в сообщество.</div>
        ) : (
          chats.map((chat, index) => (
            <Link
              key={chat.id}
              href={`/chats/${chat.id}`}
              className="block px-4 py-3 transition hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surfaceElevated text-sm font-semibold text-text">
                  {chat.title.slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <p className="truncate text-sm font-semibold text-text">{chat.title}</p>
                    {chat.lastMessage ? (
                      <span className="text-[11px] text-muted">{shortDateTime(chat.lastMessage.createdAt)}</span>
                    ) : null}
                  </div>

                  <p className="truncate text-sm text-muted">
                    {chat.lastMessage
                      ? chat.lastMessage.type === 'image'
                        ? 'Фото'
                        : `${chat.lastMessage.sender.nickname}: ${chat.lastMessage.text ?? ''}`
                      : 'Нет сообщений'}
                  </p>
                </div>
              </div>

              {index < chats.length - 1 ? <div className="mt-3 border-b border-white/5" /> : null}
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
