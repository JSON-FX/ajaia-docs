'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccessRole } from '@/lib/access';
import { apiFetch } from '@/lib/client';
import Editor from './Editor';
import SaveStatus, { type SaveState } from './SaveStatus';
import ShareBar from './ShareBar';
import CommentsPanel from './CommentsPanel';
import VersionHistory from './VersionHistory';
import PresenceBar from './PresenceBar';
import ExportMenu from './ExportMenu';

const AUTOSAVE_DELAY_MS = 800;

type Panel = 'share' | 'comments' | 'history' | null;

export default function DocumentEditor({
  documentId,
  initialTitle,
  initialContent,
  ownerName,
  role,
  currentUserId,
}: {
  documentId: string;
  initialTitle: string;
  initialContent: string;
  ownerName: string;
  role: AccessRole;
  currentUserId: string;
}) {
  const editable = role === 'OWNER' || role === 'EDITOR';
  const isOwner = role === 'OWNER';

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  // Bumping this remounts the editor, which is how a restored revision replaces the
  // TipTap document — the editor owns its own state once mounted.
  const [editorKey, setEditorKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
  const [panel, setPanel] = useState<Panel>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ title?: string; contentHtml?: string }>({});

  const flush = useCallback(async () => {
    const payload = pendingRef.current;
    if (Object.keys(payload).length === 0) return;

    pendingRef.current = {};
    setSaveState({ status: 'saving' });

    const result = await apiFetch(`/api/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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

  function togglePanel(next: Exclude<Panel, null>) {
    setPanel((current) => (current === next ? null : next));
  }

  /** A restore already persisted server-side — swap local state without re-saving it. */
  function handleRestored(doc: { title: string; contentHtml: string }) {
    pendingRef.current = {};
    if (timerRef.current) clearTimeout(timerRef.current);
    setTitle(doc.title);
    setContent(doc.contentHtml);
    setEditorKey((k) => k + 1);
    setSaveState({ status: 'saved', at: Date.now() });
  }

  const panelButton = (id: Exclude<Panel, null>, label: string) => (
    <button
      type="button"
      onClick={() => togglePanel(id)}
      aria-pressed={panel === id}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        panel === id
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="no-print border-b border-zinc-200 bg-white">
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
              onBlur={() => editable && scheduleSave({ title })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm font-medium outline-none transition hover:border-zinc-200 focus:border-zinc-400 disabled:cursor-default disabled:hover:border-transparent"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PresenceBar documentId={documentId} />

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

            {panelButton('comments', 'Comments')}
            {panelButton('history', 'History')}
            <ExportMenu documentId={documentId} />

            {isOwner && panelButton('share', panel === 'share' ? 'Close sharing' : 'Share')}
          </div>
        </div>

        {panel === 'share' && isOwner && <ShareBar documentId={documentId} />}
        {panel === 'comments' && (
          <CommentsPanel documentId={documentId} currentUserId={currentUserId} />
        )}
        {panel === 'history' && (
          <VersionHistory documentId={documentId} onRestored={handleRestored} />
        )}
      </header>

      {!editable && (
        <div className="no-print border-b border-amber-200 bg-amber-50">
          <p className="mx-auto w-full max-w-4xl px-6 py-2.5 text-sm text-amber-900">
            You have view-only access to this document. It is owned by {ownerName}. You can
            still leave comments.
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <div className="doc-sheet overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <Editor
            key={editorKey}
            initialContent={content}
            editable={editable}
            onChange={(contentHtml) => scheduleSave({ contentHtml })}
          />
        </div>
      </main>
    </div>
  );
}
