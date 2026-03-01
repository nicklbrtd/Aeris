'use client';

import { useEffect, useState } from 'react';

import { getTheme, setTheme } from '@/lib/storage';

export function ThemeToggle(): JSX.Element {
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const value = getTheme();
    setThemeState(value);
    document.documentElement.classList.toggle('dark', value === 'dark');
  }, []);

  const onToggle = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-full border border-white/10 bg-surfaceElevated px-4 py-2 text-sm text-text transition hover:scale-[1.02]"
    >
      Тема: {theme === 'dark' ? 'Тёмная' : 'Светлая'}
    </button>
  );
}
