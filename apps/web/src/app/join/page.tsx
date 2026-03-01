'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { joinByInvite } from '@/lib/api';
import { setGuestToken } from '@/lib/storage';

export default function JoinPage(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const prefilledCode = useMemo(() => params.get('code') ?? '', [params]);

  const [code, setCode] = useState(prefilledCode);
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await joinByInvite({
        code,
        nickname,
        avatarUrl,
      });

      if (result.guestToken) {
        setGuestToken(result.guestToken);
      }

      router.replace('/chats');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-surface/80 p-6 shadow-glass backdrop-blur-xl">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-text">Войти по инвайту</h1>
        <p className="mb-6 text-sm text-muted">Анонимный аккаунт на этом устройстве. Телефон и email не нужны.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Инвайт-код</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
              placeholder="DEMO2026"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Никнейм</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
              placeholder="Например, Luna"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Аватар URL (опционально)</span>
            <input
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
              placeholder="https://..."
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? 'Входим...' : 'Продолжить'}
          </button>
        </form>
      </div>
    </main>
  );
}
