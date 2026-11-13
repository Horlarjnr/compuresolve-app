'use client';
import { ErrorState } from '@/components/ui/States';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl">
      <ErrorState kind="server" onRetry={reset} />
    </main>
  );
}
