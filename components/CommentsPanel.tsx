'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client';

type Comment = {
  id: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  authorId: string;
  authorName: string;
};

/**
 * Document-level comments.
 *
 * Deliberately not anchored to text ranges. Inline comments need a custom TipTap mark plus
 * logic to keep anchors valid as the text around them changes — and a comment pointing at
 * the wrong sentence is worse than one that points at the document. See ARCHITECTURE.md.
 *
 * Viewers can comment. That is the point of read-only sharing: a reviewer participates
 * without gaining write access to the content.
 */
export default function CommentsPanel({
  documentId,
  currentUserId,
}: {
  documentId: string;
  currentUserId: string;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await apiFetch<{ comments: Comment[] }>(
        `/api/documents/${documentId}/comments`
      );
      if (cancelled) return;
      if (result.ok) setComments(result.data.comments);
      else setError(result.error.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function post(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;

    setBusy(true);
    setError(null);

    const result = await apiFetch<{ comments: Comment[] }>(
      `/api/documents/${documentId}/comments`,
      { method: 'POST', body: JSON.stringify({ body: draft.trim() }) }
    );

    if (result.ok) {
      setComments(result.data.comments);
      setDraft('');
    } else setError(result.error.message);

    setBusy(false);
  }

  async function toggleResolved(comment: Comment) {
    setBusy(true);
    const result = await apiFetch<{ comments: Comment[] }>(
      `/api/documents/${documentId}/comments/${comment.id}`,
      { method: 'PATCH', body: JSON.stringify({ resolved: !comment.resolved }) }
    );
    if (result.ok) setComments(result.data.comments);
    else setError(result.error.message);
    setBusy(false);
  }

  async function remove(comment: Comment) {
    setBusy(true);
    const result = await apiFetch<{ comments: Comment[] }>(
      `/api/documents/${documentId}/comments/${comment.id}`,
      { method: 'DELETE' }
    );
    if (result.ok) setComments(result.data.comments);
    else setError(result.error.message);
    setBusy(false);
  }

  const open = comments?.filter((c) => !c.resolved) ?? [];
  const resolved = comments?.filter((c) => c.resolved) ?? [];
  const visible = showResolved ? resolved : open;

  return (
    <div className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto w-full max-w-4xl px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-700">
            Comments {comments && <span className="text-zinc-400">({open.length} open)</span>}
          </h2>
          {resolved.length > 0 && (
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline"
            >
              {showResolved ? `Show open (${open.length})` : `Show resolved (${resolved.length})`}
            </button>
          )}
        </div>

        <form onSubmit={post} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Leave a comment for anyone with access…"
            aria-label="New comment"
            className="min-w-0 flex-1 resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="h-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Posting…' : 'Comment'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4">
          {comments === null ? (
            <p className="text-sm text-zinc-500">Loading comments…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {showResolved ? 'No resolved comments.' : 'No comments yet.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {visible.map((comment) => (
                <li
                  key={comment.id}
                  className={`rounded-lg border px-3 py-2 ${
                    comment.resolved
                      ? 'border-zinc-200 bg-zinc-100 opacity-70'
                      : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{comment.authorName}</span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {new Date(comment.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {/* Rendered as text, never as HTML — comments are not sanitised markup. */}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{comment.body}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleResolved(comment)}
                      disabled={busy}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {comment.resolved ? 'Reopen' : 'Resolve'}
                    </button>
                    {comment.authorId === currentUserId && (
                      <button
                        type="button"
                        onClick={() => remove(comment)}
                        disabled={busy}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
