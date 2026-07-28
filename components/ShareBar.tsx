'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client';

/**
 * Inline share bar rather than a modal — a deliberate cut under the compressed timebox
 * (spec §10A). Same capabilities: grant by email, pick a role, list current shares,
 * revoke. Only the presentation is cheaper.
 */

type Share = {
  userId: string;
  name: string;
  email: string;
  role: 'VIEWER' | 'EDITOR';
};

export default function ShareBar({ documentId }: { documentId: string }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'VIEWER' | 'EDITOR'>('VIEWER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await apiFetch<{ shares: Share[] }>(`/api/documents/${documentId}/shares`);
      if (cancelled) return;
      if (result.ok) setShares(result.data.shares);
      else setLoadError(result.error.message);
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function addShare(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setBusy(true);
    setError(null);

    const result = await apiFetch<{ shares: Share[] }>(`/api/documents/${documentId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), role }),
    });

    if (!result.ok) setError(result.error.message);
    else {
      setShares(result.data.shares);
      setEmail('');
    }

    setBusy(false);
  }

  async function revoke(userId: string) {
    setBusy(true);
    setError(null);

    const result = await apiFetch<{ shares: Share[] }>(
      `/api/documents/${documentId}/shares/${userId}`,
      { method: 'DELETE' }
    );

    if (!result.ok) setError(result.error.message);
    else setShares(result.data.shares);

    setBusy(false);
  }

  return (
    <div className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto w-full max-w-4xl px-6 py-4">
        <h2 className="text-sm font-medium text-zinc-700">Share this document</h2>

        <form onSubmit={addShare} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="bob@ajaia.test"
            aria-label="Email address to share with"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />

          <select
            value={role}
            onChange={(event) => setRole(event.target.value as 'VIEWER' | 'EDITOR')}
            aria-label="Access level"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          >
            <option value="VIEWER">Viewer</option>
            <option value="EDITOR">Editor</option>
          </select>

          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Add'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4">
          {loadError ? (
            <p className="text-sm text-red-700">{loadError}</p>
          ) : shares === null ? (
            <p className="text-sm text-zinc-500">Loading current access…</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Not shared with anyone yet. Try {'bob@ajaia.test'} or {'carol@ajaia.test'}.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {shares.map((share) => (
                <li
                  key={share.userId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{share.name}</span>
                    <span className="block truncate text-xs text-zinc-500">{share.email}</span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        share.role === 'EDITOR'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {share.role === 'EDITOR' ? 'Editor' : 'Viewer'}
                    </span>
                    <button
                      type="button"
                      onClick={() => revoke(share.userId)}
                      disabled={busy}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
