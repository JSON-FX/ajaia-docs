import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LoginForm from '@/components/LoginForm';

export default async function LoginPage() {
  if (await getSession()) redirect('/dashboard');

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Ajaia Docs</h1>
          <p className="mt-2 text-sm text-zinc-600">
            A lightweight collaborative document editor.
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-xs text-zinc-500">
          Authentication is mocked for this assignment — no passwords. Pick a seeded
          account to continue.
        </p>
      </div>
    </main>
  );
}
