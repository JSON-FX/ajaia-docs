'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccessRole } from '@/lib/access';
import { apiFetch } from '@/lib/client';
import Editor from './Editor';
import SaveStatus, { type SaveState } from './SaveStatus';
import ShareBar from './ShareBar';

const AUTOSAVE_DELAY_MS = 800;

export default function DocumentEditor({
  documentId,
  initialTitle,
  initialContent,
  ownerName,
  role,
}: {
  documentId: string;
  initialTitle: string;
  initialContent: string;
  ownerName: string;
  role: AccessRole;
}) {
  const editable = role === 'OWNER' || role === 'EDITOR';
  const isOwner = role === 'OWNER';

  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [shareOpen, setShareOpen] = useState(false);

  // Refs, not state: the debounce timer must read the newest values without re-creating
  // itself on every keystroke, and the pending payload must survive re-renders.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ title?: string; contentHtml?: string }>({});

  const flush = useCallback(async () => {
    const payload = pendingRef.current;
    if (Object.keys(payload).length === 0) return;

    // Clear before the request so edits made *during* the save aren't dropped — they
    // accumulate into the next flush instead.
    pendingRef.current = {};
    setSaveState({ status: 'saving' });

    const result = await apiFetch(`/api/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
      // Put the failed payload back so Retry has something to send, without clobbering
      // anything typed since.
      pendingRef.current = { ...payload, ...pendingRef.current };
      setSaveState({ status: 'error', message: result.error.message });
      return;
    }

    setSaveState({ status: 'saved', at: Date.now() });
  }, [documentId]);

  const scheduleSave = useCallback(
    (patch: { title?: string; contentHtml?: string }) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    [flush]
  );

  // Flush anything pending on unmount so navigating away mid-debounce doesn't lose the
  // last edit.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Warn before closing the tab with unsaved changes still in the debounce window.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (Object.keys(pendingRef.current).length > 0) event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  function saveNow() {
    if (timerRef.current) clearTimeout(timerRef.current);
    flush();
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/dashboard"
              className="shrink-0 text-sm text-zinc-500 transition hover:text-zinc-900"
            >
              ← Documents
            </Link>

            <input
              value={title}
              disabled={!editable}
              aria-label="Document title"
              onChange={(event) => setTitle(event.target.value)}
              // Autosave on blur, per spec — plus it joins the same debounce queue so
              // typing a title then immediately editing sends one request, not two.
              onBlur={() => editable && scheduleSave({ title })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-medium outline-none transition hover:border-zinc-200 focus:border-zinc-400 disabled:cursor-default disabled:hover:border-transparent"
            />
          </div>

          <div className="flex items-center gap-3">
            {editable && <SaveStatus state={saveState} onRetry={saveNow} />}

            {editable && (
              <button
                type="button"
                onClick={saveNow}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Save
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => setShareOpen((open) => !open)}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                {shareOpen ? 'Close sharing' : 'Share'}
              </button>
            )}
          </div>
        </div>

        {isOwner && shareOpen && <ShareBar documentId={documentId} />}
      </header>

      {!editable && (
        <div className="border-b border-amber-200 bg-amber-50">
          <p className="mx-auto w-full max-w-4xl px-6 py-2.5 text-sm text-amber-900">
            You have view-only access to this document. It is owned by {ownerName}.
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <Editor
            initialContent={initialContent}
            editable={editable}
            onChange={(contentHtml) => scheduleSave({ contentHtml })}
          />
        </div>
      </main>
    </div>
  );
}
