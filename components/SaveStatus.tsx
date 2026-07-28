'use client';

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; at: number }
  | { status: 'error'; message: string };

/**
 * The "Save failed — retry" branch matters more than any other error state here: going
 * offline mid-edit is the failure a reviewer is most likely to trigger on purpose, and
 * silently losing their typing would be the worst possible answer.
 */
export default function SaveStatus({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  if (state.status === 'saving') {
    return <span className="text-xs text-zinc-500">Saving…</span>;
  }

  if (state.status === 'saved') {
    return <span className="text-xs text-emerald-700">All changes saved</span>;
  }

  if (state.status === 'error') {
    return (
      <span className="flex items-center gap-2 text-xs text-red-700" role="alert">
        Save failed
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-red-300 bg-white px-2 py-0.5 font-medium text-red-700 transition hover:bg-red-50"
        >
          Retry
        </button>
      </span>
    );
  }

  return <span className="text-xs text-zinc-400">Up to date</span>;
}
