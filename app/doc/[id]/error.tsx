'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Error boundary for the editor route (spec §6A). Malformed contentHtml or a failure
 * inside TipTap must not white-screen the app — the reviewer should always have a way
 * back to the dashboard.
 */
export default function DocumentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[doc/[id]]', error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">This document failed to load</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Something went wrong while opening it. Your saved content is unaffected.
        </p>

        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
