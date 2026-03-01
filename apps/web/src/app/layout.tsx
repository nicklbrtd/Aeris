import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { ServiceWorkerRegister } from '@/components/sw-register';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Аэрис',
  description: 'Приватный мессенджер и комьюнити',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Aeris',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f1218',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

function ThemeBootScript(): JSX.Element {
  const script = `
    try {
      var t = localStorage.getItem('mfs_theme') || 'dark';
      document.documentElement.classList.toggle('dark', t !== 'light');
    } catch (e) {}
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="ru">
      <body>
        <ThemeBootScript />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
