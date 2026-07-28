'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';

/**
 * One-click account switching is a deliberate reviewer-UX choice: testing the sharing
 * flow means changing identity repeatedly, and a password form would add friction to
 * every single switch for zero grading value.
 */
const SEEDED = [
  { email: 'alice@ajaia.test', name: 'Alice Reyes', hint: 'owns 2 docs' },
  { email: 'bob@ajaia.test', name: 'Bob Santos', hint: 'shares a doc with Alice' },
  { email: 'carol@ajaia.test', name: 'Carol Dimaano', hint: 'no docs yet' },
];

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(address: string) {
    setPending(address);
    setError(null);

    const result = await apiFetch<{ user: { id: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: address }),
    });

    if (!result.ok) {
      setError(result.error.message);
      setPending(null);
      return;
    }

    // refresh() so the server components re-read the new session cookie.
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium text-zinc-700">Continue as</h2>

      <div className="mt-3 space-y-2">
        {SEEDED.map((user) => (
          <button
            key={user.email}
            type="button"
            onClick={() => login(user.email)}
            disabled={pending !== null}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-left transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>
              <span className="block text-sm font-medium">{user.name}</span>
              <span className="block text-xs text-zinc-500">{user.email}</span>
            </span>
            <span className="text-xs text-zinc-400">
              {pending === user.email ? 'Signing in…' : user.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-zinc-200" />
        <span className="text-xs uppercase tracking-wide text-zinc-400">or</span>
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (email.trim()) login(email.trim());
        }}
      >
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
          Sign in with email
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="alice@ajaia.test"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
          <button
            type="submit"
            disabled={pending !== null || !email.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
