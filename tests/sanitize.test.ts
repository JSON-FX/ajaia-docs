import { describe, expect, it } from 'vitest';
import { isEffectivelyEmpty, sanitizeHtml } from '@/lib/sanitize';

/**
 * Regression guard for the XSS boundary.
 *
 * These cases exist because the first implementation passed `USE_PROFILES: { html: true }`
 * alongside ALLOWED_TAGS. DOMPurify treats a profile as the *base* allowlist and appends
 * ALLOWED_TAGS to it, so the deliberately tight list was silently widened to the whole
 * HTML profile — `<img src=x onerror=...>` came back with the tag intact and only the
 * event handler stripped, which reads as safe until you look closely.
 */
describe('sanitizeHtml', () => {
  it('drops tags outside the allowlist entirely, not just their handlers', () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).toBe('');
    expect(sanitizeHtml('<iframe src="https://evil.test"></iframe>')).toBe('');
    expect(sanitizeHtml('<form><input name="pw"></form>')).toBe('');
    expect(sanitizeHtml('<svg><script>alert(1)</script></svg>')).toBe('');
  });

  it('removes script tags but keeps surrounding content', () => {
    expect(sanitizeHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
  });

  it('strips event handlers and inline styles', () => {
    expect(sanitizeHtml('<p onclick="alert(1)">text</p>')).toBe('<p>text</p>');
    expect(sanitizeHtml('<p style="position:fixed">text</p>')).toBe('<p>text</p>');
  });

  it('strips dangerous URL schemes while keeping the link text', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).not.toContain('javascript:');
    expect(sanitizeHtml('<a href="data:text/html;base64,x">click</a>')).not.toContain('data:');
  });

  it('preserves everything TipTap can actually render', () => {
    const html =
      '<h1>H</h1><p><strong>b</strong><em>i</em><u>u</u></p><ul><li>x</li></ul><ol><li>y</li></ol><blockquote><p>q</p></blockquote>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('keeps safe links with their target and rel intact', () => {
    const html = '<a href="https://example.com" target="_blank" rel="noopener">ok</a>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe('isEffectivelyEmpty', () => {
  it('treats structural-only HTML as empty so blank uploads are rejected', () => {
    expect(isEffectivelyEmpty('<p></p>')).toBe(true);
    expect(isEffectivelyEmpty('<p>&nbsp;</p>')).toBe(true);
    expect(isEffectivelyEmpty('')).toBe(true);
  });

  it('treats real text as non-empty', () => {
    expect(isEffectivelyEmpty('<p>content</p>')).toBe(false);
  });
});
