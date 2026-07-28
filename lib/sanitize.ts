import sanitize from 'sanitize-html';

/**
 * The XSS boundary.
 *
 * We persist user-supplied HTML (TipTap output, and HTML produced by mammoth/marked from
 * uploaded files) straight into Postgres and render it back into a contenteditable. That
 * makes sanitisation non-optional, and it has to happen on the *server* on every write —
 * a client-side-only sanitise is trivially bypassed by curling the API directly.
 *
 * This allowlist is deliberately tight: it matches exactly what our TipTap configuration
 * (StarterKit + Underline) can render. Anything else is noise at best and an injection
 * vector at worst. One module, imported by both POST /api/upload and
 * PATCH /api/documents/:id, so the two paths can never drift apart.
 *
 * WHY sanitize-html AND NOT DOMPurify: isomorphic-dompurify depends on jsdom, which
 * resolves internals through dynamic requires that neither Turbopack nor webpack could
 * trace into a Vercel serverless bundle. Every route importing this module returned an
 * opaque 500 in production — saving a document was broken — while working perfectly on
 * `next start` locally, because a local server still resolves from node_modules on disk.
 * `serverExternalPackages` and a webpack build were both tried and neither fixed it.
 * sanitize-html is pure JavaScript with no DOM emulation, so there is nothing to fail to
 * bundle. It is allowlist-based in the same way, and the test suite pins the behaviour.
 */

export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
] as const;

export const ALLOWED_ATTR = ['href', 'target', 'rel'] as const;

/** 1 MB ceiling on stored content (spec §6A). Guards the DB and the sanitiser alike. */
export const MAX_CONTENT_BYTES = 1_000_000;

export function sanitizeHtml(dirty: string): string {
  return sanitize(dirty, {
    allowedTags: [...ALLOWED_TAGS],
    // Attributes are scoped to <a>; nothing else needs any, so nothing else gets any.
    allowedAttributes: { a: [...ALLOWED_ATTR] },
    // Blocks javascript: and data: URLs in href.
    allowedSchemes: ['http', 'https', 'mailto'],
    // Disallowed tags are dropped but their text is kept, so stripping a stray <div>
    // wrapper does not silently delete the user's paragraph inside it. The exception is
    // nonTextTags below, whose *contents* are never text worth keeping.
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
  });
}

/**
 * True when the HTML carries no actual text and no meaningful structure — e.g. a .docx
 * that parsed to `<p></p>` or a file whose entire body was stripped by the allowlist.
 * Used to reject "successful" uploads that would produce a blank document.
 */
export function isEffectivelyEmpty(html: string): boolean {
  const withoutTags = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  return withoutTags.trim().length === 0;
}

export function exceedsSizeLimit(html: string): boolean {
  return Buffer.byteLength(html, 'utf8') > MAX_CONTENT_BYTES;
}
