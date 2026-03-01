'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { getMe } from '@/lib/api';

export default function HomePage(): null {
  const router = useRouter();

  useEffect(() => {
    getMe()
      .then(() => {
        router.replace('/chats');
      })
      .catch(() => {
        router.replace('/join');
      });
  }, [router]);

  return null;
}
