'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import UploadButton from './UploadButton';

export default function DashboardHeader({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDocument() {
    setCreating(true);
    setError(null);

    const result = await apiFetch<{ id: string }>('/api/documents', { method: 'POST' });

    if (!result.ok) {
      setError(result.error.message);
      setCreating(false);
      return;
    }

    router.push(`/doc/${result.data.id}`);
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div>
          <p className="text-sm font-semibold tracking-tight">Ajaia Docs</p>
          <p className="text-xs text-zinc-500">
            Signed in as {userName} · {userEmail}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <UploadButton onError={setError} />

          <button
            type="button"
            onClick={createDocument}
            disabled={creating}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'New document'}
          </button>

          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Switch user
          </button>
        </div>
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50">
          <p
            role="alert"
            className="mx-auto w-full max-w-5xl px-6 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        </div>
      )}
    </header>
  );
}
