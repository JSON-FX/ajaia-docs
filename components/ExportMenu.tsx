'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Export.
 *
 * Markdown is generated server-side by a hand-rolled converter (lib/markdown.ts) and
 * downloaded as a file.
 *
 * PDF deliberately goes through the browser's own print-to-PDF rather than a server-side
 * renderer. A real PDF pipeline means headless Chromium in a serverless function — a large
 * binary with exactly the bundling characteristics that already broke this deployment once.
 * The browser's engine renders the same page with a print stylesheet, costs nothing, and
 * cannot fail at deploy time. The button says "Print / Save as PDF" because that is
 * honestly what it does.
 */
export default function ExportMenu({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        Export
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
        >
          <a
            role="menuitem"
            href={`/api/documents/${documentId}/export`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
          >
            Download as Markdown
            <span className="block text-xs text-zinc-400">.md file</span>
          </a>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              // Let the menu unmount before the print dialog freezes rendering.
              setTimeout(() => window.print(), 50);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50"
          >
            Print / Save as PDF
            <span className="block text-xs text-zinc-400">Uses your browser&apos;s print dialog</span>
          </button>
        </div>
      )}
    </div>
  );
}
