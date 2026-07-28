'use client';

import { useEffect, useState } from 'react';

type Viewer = { userId: string; name: string };

const HEARTBEAT_MS = 8_000;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Deterministic colour per user, so the same person keeps the same chip between sessions. */
const COLOURS = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-teal-500',
];

function colourFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return COLOURS[hash % COLOURS.length];
}

/**
 * Presence indicator — who else has this document open.
 *
 * Deliberately NOT real-time collaborative editing: there is no shared document state and
 * no conflict resolution, and saves remain last-write-wins. This answers "am I about to
 * step on someone" and makes that risk visible rather than silent.
 */
export default function PresenceBar({ documentId }: { documentId: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/presence`, { method: 'POST' });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!cancelled) setViewers(data.viewers ?? []);
      } catch {
        // A dropped heartbeat is not worth surfacing — the next one recovers.
      }
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      // Leave promptly instead of waiting for the TTL to lapse. keepalive so the request
      // survives the page navigation that triggered the unmount.
      fetch(`/api/documents/${documentId}/presence`, {
        method: 'DELETE',
        keepalive: true,
      }).catch(() => {});
    };
  }, [documentId]);

  if (viewers.length === 0) return null;

  return (
    <div className="flex items-center gap-2" title={`${viewers.map((v) => v.name).join(', ')} also viewing`}>
      <div className="flex -space-x-1.5">
        {viewers.slice(0, 3).map((viewer) => (
          <span
            key={viewer.userId}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white ${colourFor(
              viewer.userId
            )}`}
          >
            {initials(viewer.name)}
          </span>
        ))}
        {viewers.length > 3 && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-400 text-[10px] font-semibold text-white ring-2 ring-white">
            +{viewers.length - 3}
          </span>
        )}
      </div>
      <span className="hidden text-xs text-zinc-500 sm:inline">
        {viewers.length === 1 ? `${viewers[0].name} is here` : `${viewers.length} others here`}
      </span>
    </div>
  );
}
