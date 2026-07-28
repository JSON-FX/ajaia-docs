'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useEffect, useRef } from 'react';
import Toolbar from './Toolbar';

/**
 * TipTap v2, free core only (StarterKit + Underline). Nothing from @tiptap-pro/*.
 *
 * Note StarterKit v2 does NOT bundle Underline — that arrived in v3. Hence the separate
 * extension import.
 */
export default function Editor({
  initialContent,
  editable,
  onChange,
}: {
  initialContent: string;
  editable: boolean;
  onChange: (html: string) => void;
}) {
  /**
   * TipTap normalises the HTML it is given (whitespace between block tags, attribute
   * ordering), and emits an `update` for that normalisation at mount. Forwarding it would
   * mean every document *open* issues a PATCH and bumps `updatedAt` — silently reordering
   * the dashboard just from viewing a file. Caught by watching the network tab on a page
   * load with no typing.
   *
   * So we capture the post-normalisation HTML as a baseline and only report genuine
   * divergence from it.
   */
  const baselineRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
    ],
    content: initialContent,
    editable,
    // Required under the App Router: TipTap renders differently on server and client, and
    // rendering immediately produces a hydration mismatch that React logs as an error.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'doc-content min-h-[60vh] px-10 py-8 focus:outline-none',
      },
    },
    onCreate: ({ editor: instance }) => {
      if (baselineRef.current === null) baselineRef.current = instance.getHTML();
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      if (baselineRef.current === null) {
        baselineRef.current = html;
        return;
      }
      if (html === baselineRef.current) return;
      onChange(html);
    },
  });

  // Role can change between renders (e.g. a share is revoked); keep TipTap in sync rather
  // than relying on the value captured at construction.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div className="px-10 py-8 text-sm text-zinc-400">Loading editor…</div>
    );
  }

  return (
    <>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </>
  );
}
