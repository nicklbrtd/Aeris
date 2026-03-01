'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createDmChat, getChats, getMe, searchUsersByNickname } from '@/lib/api';
import { shortDateTime } from '@/lib/utils';
import type { Chat, User, UserSearchResult } from '@/lib/types';

function getOrigin(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }
  return window.location.origin;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ChatsPage(): JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [creatingDmFor, setCreatingDmFor] = useState<string | null>(null);
  const [status, setStatus] = useState('');

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

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError('');
      return;
    }

    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError('');
      searchUsersByNickname(query)
        .then((res) => {
          setSearchResults(res.users);
          if (res.users.length === 0) {
            setSearchError('Никого не нашли');
          }
        })
        .catch((err) => {
          setSearchError(err instanceof Error ? err.message : 'Ошибка поиска');
          setSearchResults([]);
        })
        .finally(() => {
          setSearchLoading(false);
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  async function startDm(userId: string): Promise<void> {
    setCreatingDmFor(userId);
    setSearchError('');

    try {
      const result = await createDmChat(userId);
      const chatsRes = await getChats();
      setChats(chatsRes.chats);
      router.push(`/chats/${result.chat.id}`);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Не удалось создать личный чат');
    } finally {
      setCreatingDmFor(null);
    }
  }

  async function onCopyChatLink(chatId: string): Promise<void> {
    const link = `${getOrigin()}/chats/${encodeURIComponent(chatId)}`;
    const copied = await copyToClipboard(link);
    setStatus(copied ? 'Ссылка на чат скопирована.' : 'Не удалось скопировать ссылку.');
  }

  async function onShareChat(chatId: string, title: string): Promise<void> {
    const link = `${getOrigin()}/chats/${encodeURIComponent(chatId)}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Чат ${title}`,
          text: 'Ссылка на чат в Аэрис',
          url: link,
        });
        return;
      } catch {
        // Пользователь мог закрыть окно share, без ошибки UX.
      }
    }

    await onCopyChatLink(chatId);
  }

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

      <section className="mb-4 rounded-3xl border border-white/10 bg-surface/80 p-4">
        <h2 className="text-sm font-semibold text-text">Найти человека по нику</h2>
        <p className="mt-1 text-xs text-muted">Введите минимум 2 символа и начните личный чат.</p>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Например, luna"
          className="mt-3 w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
        />

        {searchLoading ? <p className="mt-2 text-xs text-muted">Ищем...</p> : null}
        {searchError ? <p className="mt-2 text-xs text-red-300">{searchError}</p> : null}

        {searchResults.length > 0 ? (
          <div className="mt-3 space-y-2">
            {searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surfaceElevated px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{user.nickname}</p>
                  <p className="truncate text-xs text-muted">{user.bio || 'Без описания'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void startDm(user.id)}
                  disabled={creatingDmFor === user.id}
                  className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {creatingDmFor === user.id ? 'Создаём...' : 'Написать'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface/80">
        {chats.length === 0 ? (
          <div className="p-6 text-sm text-muted">Пока нет чатов. Найдите человека по нику выше или зайдите в сообщество.</div>
        ) : (
          chats.map((chat, index) => (
            <div key={chat.id} className="px-4 py-3 transition hover:bg-white/5">
              <Link href={`/chats/${chat.id}`} className="block">
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
              </Link>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onCopyChatLink(chat.id)}
                  className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-text"
                >
                  Ссылка
                </button>
                <button
                  type="button"
                  onClick={() => void onShareChat(chat.id, chat.title)}
                  className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-text"
                >
                  Поделиться
                </button>
              </div>

              {index < chats.length - 1 ? <div className="mt-3 border-b border-white/5" /> : null}
            </div>
          ))
        )}
      </div>

      {status ? <p className="mt-3 text-sm text-emerald-300">{status}</p> : null}
    </main>
  );
}
