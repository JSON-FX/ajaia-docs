import mammoth from 'mammoth';
import { marked } from 'marked';

/**
 * Upload parsing (spec §6). Every branch returns raw, UNSANITISED html — the caller is
 * responsible for running it through sanitizeHtml(). Keeping parse and sanitise separate
 * means the sanitiser stays the single boundary rather than being duplicated per format.
 */

export const ALLOWED_EXTENSIONS = ['.txt', '.md', '.docx'] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

/** 2 MB cap on the uploaded file itself (distinct from the 1 MB stored-content cap). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '2 MB';

export class ParseError extends Error {}

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export function isAllowedExtension(ext: string): ext is AllowedExtension {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Strips the extension to make a sensible default document title. */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  const stem = dot === -1 ? base : base.slice(0, dot);
  return stem.trim() || 'Untitled document';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text → paragraphs. Escaped first: .txt content is never markup. */
export function parseTxt(text: string): string {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) return '';

  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export async function parseMarkdown(text: string): Promise<string> {
  // marked returns string synchronously in default config, but its type is string |
  // Promise<string>; awaiting covers both without a cast.
  return await marked.parse(text, { async: false, gfm: true, breaks: false });
}

export async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer });
    return value;
  } catch {
    // mammoth throws on anything that isn't a real OOXML package — including a .txt
    // renamed to .docx, which is exactly why extension alone is not the gate.
    throw new ParseError(
      'That file could not be read as a .docx. It may be corrupt or not really a Word document.'
    );
  }
}

/** Dispatch on extension. Returns unsanitised HTML. */
export async function parseUpload(
  extension: AllowedExtension,
  buffer: Buffer
): Promise<string> {
  switch (extension) {
    case '.docx':
      return parseDocx(buffer);
    case '.md':
      return parseMarkdown(buffer.toString('utf8'));
    case '.txt':
      return parseTxt(buffer.toString('utf8'));
  }
}
