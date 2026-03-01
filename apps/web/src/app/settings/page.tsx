'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { ThemeToggle } from '@/components/theme-toggle';
import {
  changePassword,
  deleteMyAccount,
  exportMyData,
  getPushPublicKey,
  getSettings,
  logout,
  logoutAllSessions,
  subscribePush,
  unsubscribePush,
  updateNotifications,
  updatePrivacy,
  updateProfile,
} from '@/lib/api';
import {
  getGuestToken,
  getSavedAccounts,
  removeSavedAccount,
  setCsrfToken,
  setGuestToken,
  touchSavedAccount,
  upsertSavedAccount,
  type DeviceAccount,
} from '@/lib/storage';
import { resetSocket } from '@/lib/socket';
import type { NotificationSettings, PrivacySettings, SettingsPayload } from '@/lib/types';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }): JSX.Element {
  return (
    <section className="space-y-3 rounded-3xl border border-white/10 bg-surface/80 p-4">
      <div>
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surfaceElevated px-3 py-3">
      <span>
        <span className="block text-sm text-text">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[hsl(var(--accent))]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export default function SettingsPage(): JSX.Element {
  const router = useRouter();

  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<DeviceAccount[]>([]);

  const [profileDraft, setProfileDraft] = useState({ nickname: '', avatarUrl: '', bio: '' });
  const [privacyDraft, setPrivacyDraft] = useState<PrivacySettings | null>(null);
  const [notificationsDraft, setNotificationsDraft] = useState<NotificationSettings | null>(null);

  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '' });
  const [deletePassword, setDeletePassword] = useState('');

  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [pushStatus, setPushStatus] = useState('Push не настроен');
  const [logoutError, setLogoutError] = useState('');
  const [dataExport, setDataExport] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSettings()
      .then((res) => {
        const guestToken = getGuestToken();
        if (guestToken) {
          upsertSavedAccount({
            userId: res.user.id,
            nickname: res.user.nickname,
            avatarUrl: res.user.avatarUrl ?? null,
            guestToken,
          });
        }
        setSavedAccounts(getSavedAccounts());
        setSettings(res);
        setProfileDraft({
          nickname: res.user.nickname,
          avatarUrl: res.user.avatarUrl || '',
          bio: res.user.bio || '',
        });
        setPrivacyDraft(res.privacy);
        setNotificationsDraft(res.notifications);
      })
      .catch(() => router.replace('/join'));
  }, [router]);

  const switchAccount = (account: DeviceAccount): void => {
    setStatus('');
    setError('');
    setGuestToken(account.guestToken);
    setCsrfToken(null);
    touchSavedAccount(account.userId);
    setSavedAccounts(getSavedAccounts());
    resetSocket();
    router.replace('/chats');
  };

  const forgetAccount = (account: DeviceAccount): void => {
    const isCurrent = settings?.user.id === account.userId;
    removeSavedAccount(account.userId);
    setSavedAccounts(getSavedAccounts());

    if (isCurrent) {
      setGuestToken(null);
      setCsrfToken(null);
      resetSocket();
      router.replace('/join');
      return;
    }

    setStatus(`Аккаунт ${account.nickname} удалён с этого устройства.`);
  };

  const accountBadges = useMemo(() => {
    if (!settings) {
      return [] as string[];
    }

    const badges = [`Сессий: ${settings.sessionsCount}`];
    if (settings.user.phone && settings.user.phoneVerified) {
      badges.push('Телефон подтверждён');
    }
    if (settings.user.email) {
      badges.push('Email подключён');
    }
    return badges;
  }, [settings]);

  const handleSingleLogout = async (): Promise<void> => {
    setLogoutError('');
    try {
      await logout();
    } catch {
      setLogoutError('Сервер временно недоступен, но локальный выход выполнен.');
    } finally {
      if (settings) {
        removeSavedAccount(settings.user.id);
      }
      resetSocket();
      setGuestToken(null);
      setCsrfToken(null);
      setSavedAccounts(getSavedAccounts());
      router.replace('/join');
    }
  };

  const handleProfileSave = async (): Promise<void> => {
    if (!settings) {
      return;
    }

    setLoading(true);
    setError('');
    setStatus('');

    try {
      await updateProfile({
        nickname: profileDraft.nickname,
        avatarUrl: profileDraft.avatarUrl || null,
        bio: profileDraft.bio || null,
      });
      const fresh = await getSettings();
      setSettings(fresh);
      setStatus('Профиль сохранён.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить профиль');
    } finally {
      setLoading(false);
    }
  };

  const handlePrivacySave = async (): Promise<void> => {
    if (!privacyDraft) {
      return;
    }

    setLoading(true);
    setError('');
    setStatus('');

    try {
      await updatePrivacy(privacyDraft);
      setStatus('Настройки приватности сохранены.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить приватность');
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationsSave = async (): Promise<void> => {
    if (!notificationsDraft) {
      return;
    }

    setLoading(true);
    setError('');
    setStatus('');

    try {
      await updateNotifications(notificationsDraft);
      setStatus('Настройки уведомлений сохранены.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить уведомления');
    } finally {
      setLoading(false);
    }
  };

  const handleEnablePush = async (): Promise<void> => {
    if (!notificationsDraft) {
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setPushStatus('Разрешение на push отклонено');
      return;
    }

    setNotificationsDraft({ ...notificationsDraft, pushEnabled: true });

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('Системные уведомления включены. Push-подписка в этом браузере не поддерживается.');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      try {
        const { publicKey } = await getPushPublicKey();
        const applicationServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      } catch (subscribeError) {
        const message = subscribeError instanceof Error ? subscribeError.message : 'Не удалось создать push-подписку';
        setPushStatus(`Push включены, но подписку создать не удалось: ${message}`);
        return;
      }
    }

    try {
      await subscribePush(subscription);
      setPushStatus('Push-подписка активна.');
    } catch (subscribeError) {
      const message = subscribeError instanceof Error ? subscribeError.message : 'Ошибка сохранения подписки';
      setPushStatus(`Push включены, но сервер отклонил подписку: ${message}`);
    }
  };

  const handleDisablePush = async (): Promise<void> => {
    if (!notificationsDraft) {
      return;
    }

    setNotificationsDraft({ ...notificationsDraft, pushEnabled: false });

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('Push выключены.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      }
      setPushStatus('Push выключены и подписка удалена.');
    } catch {
      setPushStatus('Push выключены локально.');
    }
  };

  const handleChangePassword = async (): Promise<void> => {
    setLoading(true);
    setError('');
    setStatus('');

    try {
      await changePassword(passwordDraft);
      setPasswordDraft({ currentPassword: '', newPassword: '' });
      setStatus('Пароль обновлён.');
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Не удалось сменить пароль');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAll = async (): Promise<void> => {
    setLoading(true);
    setError('');
    setStatus('');

    try {
      await logoutAllSessions();
      if (settings) {
        removeSavedAccount(settings.user.id);
      }
      resetSocket();
      setGuestToken(null);
      setCsrfToken(null);
      setSavedAccounts(getSavedAccounts());
      router.replace('/join');
    } catch (logoutAllError) {
      setError(logoutAllError instanceof Error ? logoutAllError.message : 'Не удалось завершить все сессии');
      setLoading(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      const payload = await exportMyData();
      setDataExport(JSON.stringify(payload, null, 2));
      setStatus('Экспорт данных подготовлен.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Не удалось экспортировать данные');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      await deleteMyAccount({ confirm: 'DELETE', ...(deletePassword ? { password: deletePassword } : {}) });
      if (settings) {
        removeSavedAccount(settings.user.id);
      }
      resetSocket();
      setGuestToken(null);
      setCsrfToken(null);
      setSavedAccounts(getSavedAccounts());
      router.replace('/join');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить аккаунт');
      setLoading(false);
    }
  };

  if (!settings || !privacyDraft || !notificationsDraft) {
    return <main className="min-h-screen p-6 text-muted">Загрузка настроек...</main>;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-16 pt-4">
      <header className="backdrop-glass mb-4 flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 shadow-glass">
        <div>
          <h1 className="text-xl font-semibold text-text">Настройки и приватность</h1>
          <p className="text-xs text-muted">Профиль, безопасность, уведомления, данные</p>
        </div>
        <Link href="/chats" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-text">
          Назад
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {accountBadges.map((badge) => (
          <span key={badge} className="rounded-full border border-white/10 bg-surface/70 px-3 py-1 text-xs text-muted">
            {badge}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        <Section title="Профиль" subtitle="Редактирование отображаемых данных аккаунта">
          <label className="block space-y-1">
            <span className="text-xs text-muted">Никнейм</span>
            <input
              value={profileDraft.nickname}
              onChange={(event) => setProfileDraft({ ...profileDraft, nickname: event.target.value })}
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted">Аватар URL</span>
            <input
              value={profileDraft.avatarUrl}
              onChange={(event) => setProfileDraft({ ...profileDraft, avatarUrl: event.target.value })}
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted">О себе</span>
            <textarea
              value={profileDraft.bio}
              onChange={(event) => setProfileDraft({ ...profileDraft, bio: event.target.value })}
              rows={3}
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-surfaceElevated px-3 py-2 text-xs text-muted">
              Email: {settings.user.email || 'не указан'}
            </div>
            <div className="rounded-2xl border border-white/10 bg-surfaceElevated px-3 py-2 text-xs text-muted">
              Телефон: {settings.user.phone || 'не указан'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleProfileSave()}
            disabled={loading}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Сохранить профиль
          </button>
        </Section>

        <Section title="Приватность" subtitle="Контроль видимости и коммуникации">
          <label className="block space-y-1">
            <span className="text-xs text-muted">Кто видит профиль</span>
            <select
              value={privacyDraft.profileVisibility}
              onChange={(event) =>
                setPrivacyDraft({ ...privacyDraft, profileVisibility: event.target.value as PrivacySettings['profileVisibility'] })
              }
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            >
              <option value="everyone">Все</option>
              <option value="contacts">Только контакты/участники</option>
              <option value="nobody">Никто</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-muted">Кто видит статус активности</span>
            <select
              value={privacyDraft.lastSeenVisibility}
              onChange={(event) =>
                setPrivacyDraft({ ...privacyDraft, lastSeenVisibility: event.target.value as PrivacySettings['lastSeenVisibility'] })
              }
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            >
              <option value="everyone">Все</option>
              <option value="contacts">Контакты/участники</option>
              <option value="nobody">Никто</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-muted">Кто может писать в личку</span>
            <select
              value={privacyDraft.allowDmFrom}
              onChange={(event) =>
                setPrivacyDraft({ ...privacyDraft, allowDmFrom: event.target.value as PrivacySettings['allowDmFrom'] })
              }
              className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            >
              <option value="everyone">Все</option>
              <option value="members">Только участники общих чатов</option>
              <option value="nobody">Никто</option>
            </select>
          </label>

          <ToggleRow
            label="Read receipts"
            hint="Показывать, что вы прочитали сообщение"
            checked={privacyDraft.readReceiptsEnabled}
            onChange={(next) => setPrivacyDraft({ ...privacyDraft, readReceiptsEnabled: next })}
          />
          <ToggleRow
            label="Typing status"
            hint="Показывать, что вы печатаете"
            checked={privacyDraft.typingStatusEnabled}
            onChange={(next) => setPrivacyDraft({ ...privacyDraft, typingStatusEnabled: next })}
          />
          <ToggleRow
            label="Обнаружение по email"
            checked={privacyDraft.discoverByEmail}
            onChange={(next) => setPrivacyDraft({ ...privacyDraft, discoverByEmail: next })}
          />
          <ToggleRow
            label="Обнаружение по телефону"
            checked={privacyDraft.discoverByPhone}
            onChange={(next) => setPrivacyDraft({ ...privacyDraft, discoverByPhone: next })}
          />
          <ToggleRow
            label="Оповещения безопасности"
            hint="Уведомлять о подозрительном входе"
            checked={privacyDraft.securityAlerts}
            onChange={(next) => setPrivacyDraft({ ...privacyDraft, securityAlerts: next })}
          />

          <button
            type="button"
            onClick={() => void handlePrivacySave()}
            disabled={loading}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Сохранить приватность
          </button>
        </Section>

        <Section title="Уведомления" subtitle="Push, email и сервисные уведомления">
          <ToggleRow
            label="Push-уведомления"
            hint="Системные уведомления в браузере"
            checked={notificationsDraft.pushEnabled}
            onChange={(next) => setNotificationsDraft({ ...notificationsDraft, pushEnabled: next })}
          />
          <ToggleRow
            label="Email-уведомления"
            checked={notificationsDraft.emailNotifications}
            onChange={(next) => setNotificationsDraft({ ...notificationsDraft, emailNotifications: next })}
          />
          <ToggleRow
            label="Маркетинговые письма"
            checked={notificationsDraft.marketingOptIn}
            onChange={(next) => setNotificationsDraft({ ...notificationsDraft, marketingOptIn: next })}
          />

          <button
            type="button"
            onClick={() => void handleEnablePush()}
            className="rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-2 text-sm text-text"
          >
            Запросить push-разрешение
          </button>
          <button
            type="button"
            onClick={() => void handleDisablePush()}
            className="rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-2 text-sm text-text"
          >
            Выключить push
          </button>
          <p className="text-xs text-muted">{pushStatus}</p>

          <button
            type="button"
            onClick={() => void handleNotificationsSave()}
            disabled={loading}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Сохранить уведомления
          </button>
        </Section>

        <Section
          title="Аккаунты на устройстве"
          subtitle="Быстрое переключение между аккаунтами (до 2) в стиле Telegram"
        >
          {savedAccounts.length === 0 ? (
            <p className="text-sm text-muted">
              Локальные аккаунты не сохранены. В dev-режиме аккаунт сохраняется после входа.
            </p>
          ) : (
            <div className="space-y-2">
              {savedAccounts.map((account) => {
                const isCurrent = settings.user.id === account.userId;
                return (
                  <div
                    key={account.userId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surfaceElevated px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">
                        {account.nickname} {isCurrent ? '• текущий' : ''}
                      </p>
                      <p className="text-xs text-muted">Последний вход: {new Date(account.lastUsedAt).toLocaleString('ru-RU')}</p>
                    </div>
                    <div className="flex gap-2">
                      {!isCurrent ? (
                        <button
                          type="button"
                          onClick={() => switchAccount(account)}
                          className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Переключить
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => forgetAccount(account)}
                        className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-text"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => router.push('/join')}
            className="rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-2 text-sm text-text"
          >
            Добавить аккаунт
          </button>
          {savedAccounts.length >= 2 ? (
            <p className="text-xs text-muted">Достигнут лимит 2 аккаунта. Удалите один, чтобы добавить новый.</p>
          ) : null}
        </Section>

        <Section title="Безопасность" subtitle="Пароль, выход из сессий, защита аккаунта">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="password"
              value={passwordDraft.currentPassword}
              onChange={(event) => setPasswordDraft({ ...passwordDraft, currentPassword: event.target.value })}
              placeholder="Текущий пароль"
              className="rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            />
            <input
              type="password"
              value={passwordDraft.newPassword}
              onChange={(event) => setPasswordDraft({ ...passwordDraft, newPassword: event.target.value })}
              placeholder="Новый пароль"
              className="rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm text-text"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleChangePassword()}
              disabled={loading}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Сменить пароль
            </button>
            <button
              type="button"
              onClick={() => void handleLogoutAll()}
              disabled={loading}
              className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 disabled:opacity-60"
            >
              Выйти со всех устройств
            </button>
            <button
              type="button"
              onClick={() => void handleSingleLogout()}
              className="rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-2 text-sm text-text"
            >
              Выйти с этого устройства
            </button>
          </div>
          {logoutError ? <p className="text-sm text-red-300">{logoutError}</p> : null}
        </Section>

        <Section title="Данные аккаунта" subtitle="Экспорт и удаление аккаунта">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={loading}
            className="rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-2 text-sm text-text disabled:opacity-60"
          >
            Сформировать экспорт
          </button>

          {dataExport ? (
            <pre className="max-h-72 overflow-auto rounded-2xl border border-white/10 bg-surfaceElevated p-3 text-xs text-muted">
              {dataExport}
            </pre>
          ) : null}

          <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-3">
            <p className="text-sm font-semibold text-red-100">Опасная зона</p>
            <p className="mt-1 text-xs text-red-200/85">
              Удаление аккаунта необратимо и удалит профиль, сессии и привязанные данные.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              placeholder="Пароль (если установлен)"
              className="mt-2 w-full rounded-2xl border border-red-300/30 bg-black/20 px-4 py-3 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={loading}
              className="mt-2 rounded-2xl bg-red-500/90 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Удалить аккаунт
            </button>
          </div>
        </Section>

        {status ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{status}</p> : null}
        {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      </div>
    </main>
  );
}
