import { describe, expect, it } from 'vitest';
import { documentToMarkdown, htmlToMarkdown, markdownFilename } from '@/lib/markdown';

/**
 * The converter is hand-rolled (no DOM, so it survives serverless bundling), which means
 * its correctness rests on tests rather than on a library's reputation.
 */
describe('htmlToMarkdown', () => {
  it('converts headings', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title\n');
    expect(htmlToMarkdown('<h2>Sub</h2>')).toBe('## Sub\n');
    expect(htmlToMarkdown('<h3>Deep</h3>')).toBe('### Deep\n');
  });

  it('converts inline emphasis', () => {
    expect(htmlToMarkdown('<p><strong>bold</strong></p>')).toBe('**bold**\n');
    expect(htmlToMarkdown('<p><em>italic</em></p>')).toBe('*italic*\n');
    expect(htmlToMarkdown('<p><s>struck</s></p>')).toBe('~~struck~~\n');
  });

  it('keeps underlined text but drops the emphasis, since Markdown has no underline', () => {
    expect(htmlToMarkdown('<p><u>underlined</u></p>')).toBe('underlined\n');
  });

  it('converts bulleted lists', () => {
    expect(htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n\n- two\n');
  });

  it('numbers ordered lists sequentially', () => {
    const out = htmlToMarkdown('<ol><li>first</li><li>second</li><li>third</li></ol>');
    expect(out).toContain('1. first');
    expect(out).toContain('2. second');
    expect(out).toContain('3. third');
  });

  it('converts links with their href', () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">site</a></p>')).toBe(
      '[site](https://example.com)\n'
    );
  });

  it('converts inline code and code blocks', () => {
    expect(htmlToMarkdown('<p><code>npm test</code></p>')).toBe('`npm test`\n');
    expect(htmlToMarkdown('<pre><code>line one</code></pre>')).toContain('```');
  });

  it('decodes HTML entities back to their characters', () => {
    expect(htmlToMarkdown('<p>a &amp; b</p>')).toBe('a & b\n');
    expect(htmlToMarkdown('<p>5 &lt; 6</p>')).toContain('5 < 6');
  });

  it('escapes characters that would otherwise be read as Markdown syntax', () => {
    // A literal asterisk in prose must not become emphasis when the file is re-rendered.
    expect(htmlToMarkdown('<p>2 * 3</p>')).toBe('2 \\* 3\n');
  });

  it('handles a full document without collapsing structure', () => {
    const html =
      '<h1>Report</h1><p>Intro <strong>bold</strong>.</p><h2>Items</h2><ul><li>alpha</li><li>beta</li></ul>';
    const out = htmlToMarkdown(html);
    expect(out).toContain('# Report');
    expect(out).toContain('Intro **bold**.');
    expect(out).toContain('## Items');
    expect(out).toContain('- alpha');
    expect(out).toContain('- beta');
  });

  it('returns a trailing newline and no runs of blank lines', () => {
    const out = htmlToMarkdown('<p>a</p><p>b</p>');
    expect(out.endsWith('\n')).toBe(true);
    expect(out).not.toMatch(/\n{3,}/);
  });
});

describe('documentToMarkdown', () => {
  it('prepends the title as an H1', () => {
    expect(documentToMarkdown('My doc', '<p>body</p>')).toBe('# My doc\n\nbody\n');
  });

  it('does not duplicate the title when the body already opens with it', () => {
    const out = documentToMarkdown('My doc', '<h1>My doc</h1><p>body</p>');
    expect(out.match(/# My doc/g)).toHaveLength(1);
  });
});

describe('markdownFilename', () => {
  it('slugifies the title', () => {
    expect(markdownFilename('Q3 Product Review')).toBe('q3-product-review.md');
  });

  it('falls back when a title has no usable characters', () => {
    expect(markdownFilename('!!!')).toBe('document.md');
  });

  it('cannot emit quotes that would break the Content-Disposition header', () => {
    expect(markdownFilename('He said "hello"')).not.toContain('"');
  });
});
