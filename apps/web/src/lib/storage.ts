const GUEST_TOKEN_KEY = 'mfs_guest_token';
const CSRF_KEY = 'mfs_csrf_token';
const THEME_KEY = 'mfs_theme';

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
