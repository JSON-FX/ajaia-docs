'use client';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';

/**
 * Active-state highlighting is read through useEditorState rather than calling
 * editor.isActive() during render. TipTap mutates its instance in place, so a plain
 * render-time read does not re-render on selection change and the buttons go stale —
 * the highlight would only update when something else happened to trigger a render.
 */
export default function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      paragraph: e.isActive('paragraph'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
    }),
  });

  const buttons = [
    {
      label: 'Bold',
      title: 'Bold (⌘B)',
      active: state.bold,
      onClick: () => editor.chain().focus().toggleBold().run(),
      className: 'font-bold',
    },
    {
      label: 'Italic',
      title: 'Italic (⌘I)',
      active: state.italic,
      onClick: () => editor.chain().focus().toggleItalic().run(),
      className: 'italic',
    },
    {
      label: 'Underline',
      title: 'Underline (⌘U)',
      active: state.underline,
      onClick: () => editor.chain().focus().toggleUnderline().run(),
      className: 'underline',
    },
    { divider: true } as const,
    {
      label: 'H1',
      title: 'Heading 1',
      active: state.h1,
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'H2',
      title: 'Heading 2',
      active: state.h2,
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Paragraph',
      title: 'Paragraph',
      active: state.paragraph,
      onClick: () => editor.chain().focus().setParagraph().run(),
    },
    { divider: true } as const,
    {
      label: 'Bullets',
      title: 'Bulleted list',
      active: state.bulletList,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered',
      title: 'Numbered list',
      active: state.orderedList,
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <div className="no-print flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-white px-4 py-2">
      {buttons.map((button, index) =>
        'divider' in button ? (
          <span key={`divider-${index}`} className="mx-1 h-5 w-px bg-zinc-200" />
        ) : (
          <button
            key={button.label}
            type="button"
            title={button.title}
            aria-pressed={button.active}
            onClick={button.onClick}
            className={`rounded px-2.5 py-1 text-sm transition ${button.className ?? ''} ${
              button.active
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            {button.label}
          </button>
        )
      )}
    </div>
  );
}
