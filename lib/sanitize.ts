import DOMPurify from 'isomorphic-dompurify';

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
 * vector at worst. One constant, imported by both POST /api/upload and
 * PATCH /api/documents/:id, so the two paths can never drift apart.
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
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
    // NOTE: do not add `USE_PROFILES: { html: true }` here. DOMPurify treats a profile as
    // the base allowlist and merely *appends* ALLOWED_TAGS to it, so setting it silently
    // widens this list to the entire HTML profile — <img>, <table>, <div> and friends all
    // start passing. Caught by an upload probe where `<img src=x onerror=...>` came back
    // with the tag intact (the onerror attribute was stripped, so it looked safe at a
    // glance). Tags outside the list must be dropped, not just de-fanged.
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
