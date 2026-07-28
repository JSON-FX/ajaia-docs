'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/client';

/**
 * Renders only the button. The "supported types / size cap" hint is required in the UI
 * (the brief calls it out) but is laid out by the parent underneath the whole button row
 * — keeping it inside this component made it a second row in a flex item, which centred
 * the button-plus-caption stack and left this button visibly higher than its neighbours.
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
    <>
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
    </>
  );
}
