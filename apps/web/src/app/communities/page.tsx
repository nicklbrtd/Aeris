'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createCommunity, getChats, getMe } from '@/lib/api';
import type { Chat, User } from '@/lib/types';

export default function CommunitiesPage(): JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getMe(), getChats()])
      .then(([meRes, chatsRes]) => {
        setMe(meRes.user);
        setChats(chatsRes.chats);
      })
      .catch(() => router.replace('/join'));
  }, [router]);

  const communities = useMemo(() => chats.filter((item) => item.type === 'community'), [chats]);

  async function onCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError('');

    try {
      await createCommunity(title);
      const data = await getChats();
      setChats(data.chats);
      setTitle('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Ошибка создания');
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-12 pt-4">
      <header className="backdrop-glass mb-4 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 shadow-glass">
        <h1 className="text-xl font-semibold text-text">Сообщества</h1>
        <Link href="/chats" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-text">
          К чатам
        </Link>
      </header>

      <div className="space-y-2 rounded-3xl border border-white/10 bg-surface/80 p-4">
        {communities.map((community) => (
          <Link
            key={community.id}
            href={`/chats/${community.id}`}
            className="block rounded-2xl border border-white/10 px-4 py-3 text-sm text-text hover:bg-white/5"
          >
            {community.title}
          </Link>
        ))}

        {communities.length === 0 ? <p className="text-sm text-muted">Пока нет сообществ.</p> : null}
      </div>

      {me?.role === 'admin' ? (
        <form onSubmit={onCreate} className="mt-4 space-y-2 rounded-3xl border border-white/10 bg-surface/80 p-4">
          <h2 className="text-sm font-semibold text-text">Создать сообщество</h2>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text"
            placeholder="Название"
            required
          />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button type="submit" className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white">
            Создать
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted">Создание сообществ доступно только администратору.</p>
      )}
    </main>
  );
}
