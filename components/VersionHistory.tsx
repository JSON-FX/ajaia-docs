'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client';

type Revision = {
  id: string;
  title: string;
  createdAt: string;
  authorName: string;
};

/**
 * Version history.
 *
 * Snapshots are taken of the state *before* an edit and coalesced server-side, so this
 * lists roughly one entry per editing session rather than one per autosave. Restoring
 * snapshots the current state first, so a restore is itself undoable.
 */
export default function VersionHistory({
  documentId,
  onRestored,
}: {
  documentId: string;
  onRestored: (doc: { title: string; contentHtml: string }) => void;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; html: string } | null>(null);

  async function load() {
    const result = await apiFetch<{ revisions: Revision[]; canRestore: boolean }>(
      `/api/documents/${documentId}/revisions`
    );
    if (result.ok) {
      setRevisions(result.data.revisions);
      setCanRestore(result.data.canRestore);
    } else setError(result.error.message);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function showPreview(revision: Revision) {
    setBusy(revision.id);
    const result = await apiFetch<{ revision: { contentHtml: string } }>(
      `/api/documents/${documentId}/revisions/${revision.id}`
    );
    if (result.ok) setPreview({ id: revision.id, html: result.data.revision.contentHtml });
    else setError(result.error.message);
    setBusy(null);
  }

  async function restore(revision: Revision) {
    setBusy(revision.id);
    setError(null);
    const result = await apiFetch<{ document: { title: string; contentHtml: string } }>(
      `/api/documents/${documentId}/revisions/${revision.id}`,
      { method: 'POST' }
    );
    if (result.ok) {
      onRestored(result.data.document);
      setPreview(null);
      await load();
    } else setError(result.error.message);
    setBusy(null);
  }

  return (
    <div className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto w-full max-w-4xl px-6 py-4">
        <h2 className="text-sm font-medium text-zinc-700">Version history</h2>
        <p className="mt-1 text-xs text-zinc-500">
          A snapshot is kept per editing session, not per keystroke. Restoring saves the
          current version first, so you can always undo a restore.
        </p>

        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-3">
          {revisions === null ? (
            <p className="text-sm text-zinc-500">Loading history…</p>
          ) : revisions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No earlier versions yet — they appear here once this document has been edited.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{revision.title}</span>
                      <span className="block text-xs text-zinc-500">
                        {new Date(revision.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        · {revision.authorName}
                      </span>
                    </span>

                    <span className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          preview?.id === revision.id ? setPreview(null) : showPreview(revision)
                        }
                        disabled={busy !== null}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {preview?.id === revision.id ? 'Hide' : 'Preview'}
                      </button>
                      {canRestore && (
                        <button
                          type="button"
                          onClick={() => restore(revision)}
                          disabled={busy !== null}
                          className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
                        >
                          {busy === revision.id ? 'Restoring…' : 'Restore'}
                        </button>
                      )}
                    </span>
                  </div>

                  {preview?.id === revision.id && (
                    <div
                      className="doc-content mt-3 max-h-64 overflow-y-auto rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                      // Content came from our own sanitised column — it was cleaned before
                      // it was ever stored.
                      dangerouslySetInnerHTML={{ __html: preview.html }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
