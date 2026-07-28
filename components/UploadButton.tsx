'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/client';

/**
 * Supported types and the size cap are stated in the UI, not only in the README — the
 * brief calls this out specifically. A user should never have to guess what will be
 * accepted and then find out by failing.
 */
export default function UploadButton({ onError }: { onError: (message: string | null) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    onError(null);

    const formData = new FormData();
    formData.append('file', file);

    const result = await apiFetch<{ id: string }>('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!result.ok) {
      onError(result.error.message);
      setUploading(false);
      // Reset so re-picking the same file still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    router.push(`/doc/${result.data.id}`);
  }

  return (
    <div className="flex flex-col items-end">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? 'Parsing file…' : 'Upload file'}
      </button>

      <span className="mt-1 text-[11px] leading-tight text-zinc-500">
        .txt, .md, .docx · max 2 MB
      </span>
    </div>
  );
}
