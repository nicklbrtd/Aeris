import { Suspense } from 'react';

import JoinClient from './join-client';

export const dynamic = 'force-dynamic';

function JoinFallback(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-surface/80 p-6 shadow-glass backdrop-blur-xl">
        <p className="text-sm text-muted">Загрузка...</p>
      </div>
    </main>
  );
}

export default function JoinPage(): JSX.Element {
  return (
    <Suspense fallback={<JoinFallback />}>
      <JoinClient />
    </Suspense>
  );
}
