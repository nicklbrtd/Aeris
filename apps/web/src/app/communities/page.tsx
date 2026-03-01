'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createCommunity, getCommunities, getMe, joinCommunity } from '@/lib/api';
import type { Community, User } from '@/lib/types';

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

export default function CommunitiesPage(): JSX.Element {
  const router = useRouter();

  const [me, setMe] = useState<User | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pendingCommunityId, setPendingCommunityId] = useState<string | null>(null);
  const [linkedCommunityId, setLinkedCommunityId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setLinkedCommunityId(params.get('community'));
  }, []);

  useEffect(() => {
    Promise.all([getMe(), getCommunities()])
      .then(([meRes, communitiesRes]) => {
        setMe(meRes.user);
        setCommunities(communitiesRes.communities);
      })
      .catch(() => router.replace('/join'));
  }, [router]);

  const linkedCommunity = useMemo(
    () => communities.find((item) => item.id === linkedCommunityId) ?? null,
    [communities, linkedCommunityId],
  );

  async function refreshCommunities(): Promise<void> {
    const data = await getCommunities();
    setCommunities(data.communities);
  }

  async function onCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    setStatus('');

    try {
      await createCommunity(title);
      await refreshCommunities();
      setTitle('');
      setStatus('Сообщество создано.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Ошибка создания');
    }
  }

  async function onJoin(communityId: string): Promise<void> {
    setPendingCommunityId(communityId);
    setError('');
    setStatus('');

    try {
      await joinCommunity(communityId);
      await refreshCommunities();
      setStatus('Вы вступили в сообщество.');
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Не удалось вступить');
    } finally {
      setPendingCommunityId(null);
    }
  }

  async function onCopyCommunityLink(communityId: string): Promise<void> {
    const link = `${getOrigin()}/communities?community=${encodeURIComponent(communityId)}`;
    const copied = await copyToClipboard(link);
    setStatus(copied ? 'Ссылка на сообщество скопирована.' : 'Не удалось скопировать ссылку');
  }

  async function onCopyChatLink(chatId: string): Promise<void> {
    const link = `${getOrigin()}/chats/${encodeURIComponent(chatId)}`;
    const copied = await copyToClipboard(link);
    setStatus(copied ? 'Ссылка на чат скопирована.' : 'Не удалось скопировать ссылку');
  }

  async function onShareCommunity(communityId: string): Promise<void> {
    const link = `${getOrigin()}/communities?community=${encodeURIComponent(communityId)}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Сообщество Аэрис',
          text: 'Присоединяйся к сообществу в Аэрис',
          url: link,
        });
        return;
      } catch {
        // Если пользователь отменил share sheet, не считаем это ошибкой.
      }
    }
    await onCopyCommunityLink(communityId);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-12 pt-4">
      <header className="backdrop-glass mb-4 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 shadow-glass">
        <h1 className="text-xl font-semibold text-text">Сообщества</h1>
        <Link href="/chats" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-text">
          К чатам
        </Link>
      </header>

      {linkedCommunity ? (
        <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-text">
          Открыта ссылка на сообщество «{linkedCommunity.title}».{' '}
          {linkedCommunity.joined ? 'Вы уже участник.' : 'Можно вступить ниже одной кнопкой.'}
        </div>
      ) : null}

      <div className="space-y-3 rounded-3xl border border-white/10 bg-surface/80 p-4">
        {communities.map((community) => {
          const highlighted = linkedCommunityId === community.id;

          return (
            <div
              key={community.id}
              className={`rounded-2xl border px-4 py-3 ${highlighted ? 'border-accent/50 bg-accent/10' : 'border-white/10 bg-surfaceElevated'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{community.title}</p>
                  <p className="text-xs text-muted">Участников: {community.membersCount}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {community.joined ? (
                    <Link
                      href={`/chats/${community.id}`}
                      className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Открыть чат
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={pendingCommunityId === community.id}
                      onClick={() => void onJoin(community.id)}
                      className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {pendingCommunityId === community.id ? 'Вступаем...' : 'Вступить'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onShareCommunity(community.id)}
                    className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-text"
                  >
                    Ссылка сообщества
                  </button>
                  {community.joined ? (
                    <button
                      type="button"
                      onClick={() => void onCopyChatLink(community.id)}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-text"
                    >
                      Ссылка чата
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

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

      {status ? <p className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{status}</p> : null}
      {error ? <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</p> : null}
    </main>
  );
}
