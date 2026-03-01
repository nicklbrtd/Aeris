const GUEST_TOKEN_KEY = 'mfs_guest_token';
const CSRF_KEY = 'mfs_csrf_token';
const THEME_KEY = 'mfs_theme';
const SAVED_ACCOUNTS_KEY = 'mfs_saved_accounts';

export type DeviceAccount = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  guestToken: string;
  lastUsedAt: number;
};

export function getGuestToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(GUEST_TOKEN_KEY);
}

export function setGuestToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!token) {
    window.localStorage.removeItem(GUEST_TOKEN_KEY);
    return;
  }

  window.localStorage.setItem(GUEST_TOKEN_KEY, token);
}

function readSavedAccountsRaw(): DeviceAccount[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(SAVED_ACCOUNTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is DeviceAccount => {
        return (
          typeof item === 'object' &&
          item !== null &&
          typeof (item as DeviceAccount).userId === 'string' &&
          typeof (item as DeviceAccount).nickname === 'string' &&
          typeof (item as DeviceAccount).guestToken === 'string' &&
          typeof (item as DeviceAccount).lastUsedAt === 'number'
        );
      })
      .slice(0, 2);
  } catch {
    return [];
  }
}

function writeSavedAccounts(items: DeviceAccount[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(items.slice(0, 2)));
}

export function getSavedAccounts(): DeviceAccount[] {
  return readSavedAccountsRaw().sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function upsertSavedAccount(params: {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  guestToken: string;
}): { overflowed: boolean } {
  const now = Date.now();
  const existing = readSavedAccountsRaw();

  const index = existing.findIndex((item) => item.userId === params.userId);
  if (index >= 0) {
    existing[index] = {
      ...existing[index],
      nickname: params.nickname,
      avatarUrl: params.avatarUrl,
      guestToken: params.guestToken,
      lastUsedAt: now,
    };
    writeSavedAccounts(existing);
    return { overflowed: false };
  }

  if (existing.length >= 2) {
    return { overflowed: true };
  }

  existing.push({
    userId: params.userId,
    nickname: params.nickname,
    avatarUrl: params.avatarUrl,
    guestToken: params.guestToken,
    lastUsedAt: now,
  });
  writeSavedAccounts(existing);
  return { overflowed: false };
}

export function removeSavedAccount(userId: string): void {
  const next = readSavedAccountsRaw().filter((item) => item.userId !== userId);
  writeSavedAccounts(next);
}

export function touchSavedAccount(userId: string): void {
  const next = readSavedAccountsRaw().map((item) =>
    item.userId === userId ? { ...item, lastUsedAt: Date.now() } : item,
  );
  writeSavedAccounts(next);
}

export function getCsrfToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(CSRF_KEY);
}

export function setCsrfToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!token) {
    window.localStorage.removeItem(CSRF_KEY);
    return;
  }

  window.localStorage.setItem(CSRF_KEY, token);
}

export function getTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: 'dark' | 'light'): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(THEME_KEY, theme);
}
