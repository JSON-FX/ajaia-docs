import Link from 'next/link';

/**
 * Shown both when a document genuinely does not exist and when the caller has no access
 * to it — the two are deliberately indistinguishable (spec §4).
 */
export default function DocumentNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Document not found</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This document doesn&apos;t exist, or it hasn&apos;t been shared with you.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
