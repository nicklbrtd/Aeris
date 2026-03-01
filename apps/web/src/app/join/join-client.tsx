'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  joinByInvite,
  loginWithPassword,
  registerWithPassword,
  resendRegisterPhoneOtp,
  verifyRegisterPhoneOtp,
} from '@/lib/api';
import { setGuestToken } from '@/lib/storage';

type AuthMode = 'register' | 'login' | 'invite';
type ContactMode = 'email' | 'phone';

export default function JoinClient(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const prefilledCode = useMemo(() => params.get('code') ?? '', [params]);

  const [mode, setMode] = useState<AuthMode>(prefilledCode ? 'invite' : 'register');

  const [inviteCode, setInviteCode] = useState(prefilledCode);
  const [inviteNickname, setInviteNickname] = useState('');
  const [inviteAvatarUrl, setInviteAvatarUrl] = useState('');

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerNickname, setRegisterNickname] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerAvatarUrl, setRegisterAvatarUrl] = useState('');
  const [contactMode, setContactMode] = useState<ContactMode>('phone');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');

  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function completeAuth(guestToken?: string | null): void {
    setGuestToken(guestToken ?? null);
    router.replace('/chats');
  }

  async function onInviteSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await joinByInvite({
        code: inviteCode,
        nickname: inviteNickname,
        avatarUrl: inviteAvatarUrl,
      });
      completeAuth(result.guestToken);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка входа по инвайту');
    } finally {
      setLoading(false);
    }
  }

  async function onLoginSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await loginWithPassword({
        identifier: loginIdentifier,
        password: loginPassword,
      });
      completeAuth(result.guestToken);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  async function onRegisterSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await registerWithPassword({
        nickname: registerNickname,
        password: registerPassword,
        avatarUrl: registerAvatarUrl,
        ...(contactMode === 'email' ? { email: registerEmail } : { phone: registerPhone }),
      });

      if (result.requiresOtp) {
        setOtpStep(true);
        setOtpHint(`Код отправлен на ${result.phoneMasked}.`);
        if (result.debugOtpCode) {
          setOtpHint(`Код отправлен на ${result.phoneMasked}. DEV-код: ${result.debugOtpCode}`);
        }
        return;
      }

      completeAuth(result.guestToken);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await verifyRegisterPhoneOtp({
        phone: registerPhone,
        code: otpCode,
      });
      completeAuth(result.guestToken);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка подтверждения OTP');
    } finally {
      setLoading(false);
    }
  }

  async function onResendOtp(): Promise<void> {
    setError('');
    setLoading(true);

    try {
      const result = await resendRegisterPhoneOtp({ phone: registerPhone });
      setOtpHint(result.debugOtpCode ? `Новый DEV-код: ${result.debugOtpCode}` : 'Новый код отправлен.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка повторной отправки OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-surface/80 p-6 shadow-glass backdrop-blur-xl">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-text">Аэрис</h1>
        <p className="mb-5 text-sm text-muted">Приватные сообщения и сообщества</p>

        <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-surfaceElevated p-1">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`rounded-xl px-2 py-2 text-xs font-semibold ${mode === 'register' ? 'bg-accent text-white' : 'text-muted'}`}
          >
            Регистрация
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setOtpStep(false);
            }}
            className={`rounded-xl px-2 py-2 text-xs font-semibold ${mode === 'login' ? 'bg-accent text-white' : 'text-muted'}`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('invite');
              setError('');
              setOtpStep(false);
            }}
            className={`rounded-xl px-2 py-2 text-xs font-semibold ${mode === 'invite' ? 'bg-accent text-white' : 'text-muted'}`}
          >
            Инвайт
          </button>
        </div>

        {mode === 'register' ? (
          otpStep && contactMode === 'phone' ? (
            <form onSubmit={onVerifyOtp} className="space-y-4">
              <p className="rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-text">{otpHint}</p>

              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">OTP-код из SMS</span>
                <input
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                  placeholder="123456"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? 'Проверяем...' : 'Подтвердить номер'}
              </button>

              <button
                type="button"
                onClick={() => void onResendOtp()}
                disabled={loading}
                className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-sm font-semibold text-text transition active:scale-[0.98] disabled:opacity-60"
              >
                Отправить OTP ещё раз
              </button>
            </form>
          ) : (
            <form onSubmit={onRegisterSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">Никнейм</span>
                <input
                  value={registerNickname}
                  onChange={(event) => setRegisterNickname(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                  placeholder="Например, Luna"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">Пароль</span>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                  placeholder="Минимум 8 символов"
                  required
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setContactMode('phone')}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${contactMode === 'phone' ? 'bg-accent text-white' : 'border border-white/10 text-muted'}`}
                >
                  Телефон + OTP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContactMode('email');
                    setOtpStep(false);
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold ${contactMode === 'email' ? 'bg-accent text-white' : 'border border-white/10 text-muted'}`}
                >
                  Email
                </button>
              </div>

              {contactMode === 'phone' ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Телефон</span>
                  <input
                    value={registerPhone}
                    onChange={(event) => setRegisterPhone(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                    placeholder="+7 999 000 00 00"
                    required
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Email</span>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                    placeholder="you@example.com"
                    required
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">Аватар URL (опционально)</span>
                <input
                  value={registerAvatarUrl}
                  onChange={(event) => setRegisterAvatarUrl(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                  placeholder="https://..."
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? 'Создаём аккаунт...' : 'Зарегистрироваться'}
              </button>
            </form>
          )
        ) : null}

        {mode === 'login' ? (
          <form onSubmit={onLoginSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Никнейм / Email / Телефон</span>
              <input
                value={loginIdentifier}
                onChange={(event) => setLoginIdentifier(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                placeholder="luna или +7999..."
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Пароль</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                placeholder="Ваш пароль"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? 'Входим...' : 'Войти'}
            </button>
          </form>
        ) : null}

        {mode === 'invite' ? (
          <form onSubmit={onInviteSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Инвайт-код</span>
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                placeholder="AERIS2026"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Никнейм</span>
              <input
                value={inviteNickname}
                onChange={(event) => setInviteNickname(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                placeholder="Например, Luna"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Аватар URL (опционально)</span>
              <input
                value={inviteAvatarUrl}
                onChange={(event) => setInviteAvatarUrl(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-surfaceElevated px-4 py-3 text-text outline-none ring-accent/40 transition focus:ring-2"
                placeholder="https://..."
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? 'Входим...' : 'Войти по инвайту'}
            </button>
          </form>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        ) : null}
      </div>
    </main>
  );
}
