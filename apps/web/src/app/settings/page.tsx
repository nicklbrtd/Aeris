'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ThemeToggle } from '@/components/theme-toggle';
import { getMe, logout, subscribePush } from '@/lib/api';
import { setCsrfToken, setGuestToken } from '@/lib/storage';
import { resetSocket } from '@/lib/socket';
import type { User } from '@/lib/types';

export default function SettingsPage(): JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [pushStatus, setPushStatus] = useState('Push не настроен (TODO)');

  useEffect(() => {
    getMe()
      .then((res) => setMe(res.user))
      .catch(() => router.replace('/join'));
  }, [router]);

  const handleLogout = async (): Promise<void> => {
    await logout().catch(() => undefined);
    resetSocket();
    setGuestToken(null);
    setCsrfToken(null);
    router.replace('/join');
  };

  const handleEnablePush = async (): Promise<void> => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('Push не поддерживается этим браузером');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushStatus('Разрешение на push отклонено');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setPushStatus('TODO: подписка через VAPID ключи ещё не реализована');
      return;
    }

    await subscribePush(subscription).catch(() => undefined);
    setPushStatus('Серверная интеграция в процессе (TODO)');
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-12 pt-4">
      <header className="backdrop-glass mb-4 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 shadow-glass">
        <h1 className="text-xl font-semibold text-text">Настройки</h1>
        <Link href="/chats" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-text">
          Назад
        </Link>
      </header>

      <div className="space-y-3 rounded-3xl border border-white/10 bg-surface/80 p-4">
        <p className="text-sm text-muted">Профиль: {me?.nickname ?? '...'}</p>
        <ThemeToggle />

        <button
          type="button"
          onClick={handleEnablePush}
          className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-left text-sm text-text"
        >
          Включить push-уведомления (фаза 2)
        </button>
        <p className="text-xs text-muted">{pushStatus}</p>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full rounded-2xl bg-red-500/85 px-4 py-3 text-sm font-semibold text-white"
        >
          Выйти
        </button>
      </div>
    </main>
  );
}
