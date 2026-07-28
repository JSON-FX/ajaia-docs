/**
 * HTML → Markdown for document export.
 *
 * Hand-rolled rather than pulling in `turndown`, which needs a DOM and therefore jsdom on
 * the server — the exact dependency that broke this app's serverless deployment once
 * already (see ARCHITECTURE.md). This runs on plain strings with no DOM emulation.
 *
 * That is only tractable because the stored HTML is not arbitrary: everything in the
 * database has already been through the sanitizer's 16-tag allowlist, so this converter
 * has a closed, known set of inputs to handle rather than the whole HTML spec.
 */

type Token = { tag: string; attrs: string; closing: boolean; text?: string };

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre']);

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Escapes characters that would otherwise be read as Markdown syntax. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /<(\/?)([a-z0-9]+)((?:\s[^>]*)?)\/?>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    if (match.index > cursor) {
      tokens.push({ tag: '#text', attrs: '', closing: false, text: html.slice(cursor, match.index) });
    }
    tokens.push({ tag: match[2].toLowerCase(), attrs: match[3] || '', closing: match[1] === '/' });
    cursor = match.index + match[0].length;
  }

  if (cursor < html.length) {
    tokens.push({ tag: '#text', attrs: '', closing: false, text: html.slice(cursor) });
  }

  return tokens;
}

function getAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

export function htmlToMarkdown(html: string): string {
  const tokens = tokenize(html);
  const blocks: string[] = [];

  let current = '';
  // Stack of active list types, so nested lists indent correctly.
  const listStack: Array<{ type: 'ul' | 'ol'; index: number }> = [];
  let blockPrefix = '';
  let inPre = false;
  let linkHref: string | null = null;

  const flush = () => {
    const trimmed = current.replace(/[ \t]+$/gm, '').trim();
    if (trimmed) blocks.push(blockPrefix + trimmed);
    current = '';
    blockPrefix = '';
  };

  for (const token of tokens) {
    if (token.tag === '#text') {
      const raw = decodeEntities(token.text ?? '');
      if (inPre) {
        current += raw;
      } else {
        // Collapse the whitespace that HTML formatting introduces between tags.
        const collapsed = raw.replace(/\s+/g, ' ');
        if (collapsed.trim() === '' && current === '') continue;
        current += escapeMarkdown(collapsed);
      }
      continue;
    }

    const { tag, closing, attrs } = token;

    switch (tag) {
      case 'br':
        current += inPre ? '\n' : '  \n';
        break;

      case 'strong':
        current += '**';
        break;

      case 'em':
        current += '*';
        break;

      // Markdown has no underline; keep the text and drop the emphasis rather than
      // inventing raw HTML in a .md file.
      case 'u':
        break;

      case 's':
        current += '~~';
        break;

      case 'code':
        if (!inPre) current += '`';
        break;

      case 'a':
        if (!closing) {
          linkHref = getAttr(attrs, 'href');
          current += '[';
        } else {
          current += linkHref ? `](${linkHref})` : ']';
          linkHref = null;
        }
        break;

      case 'pre':
        if (!closing) {
          flush();
          inPre = true;
          current += '```\n';
        } else {
          inPre = false;
          current = current.replace(/\n+$/, '') + '\n```';
          flush();
        }
        break;

      case 'h1':
      case 'h2':
      case 'h3':
        if (!closing) {
          flush();
          blockPrefix = '#'.repeat(Number(tag[1])) + ' ';
        } else {
          flush();
        }
        break;

      case 'blockquote':
        if (closing) flush();
        else flush();
        break;

      case 'ul':
      case 'ol':
        if (!closing) {
          flush();
          listStack.push({ type: tag, index: 0 });
        } else {
          flush();
          listStack.pop();
        }
        break;

      case 'li':
        if (!closing) {
          flush();
          const depth = Math.max(0, listStack.length - 1);
          const active = listStack[listStack.length - 1];
          if (active) {
            active.index += 1;
            const marker = active.type === 'ol' ? `${active.index}. ` : '- ';
            blockPrefix = '  '.repeat(depth) + marker;
          } else {
            blockPrefix = '- ';
          }
        } else {
          flush();
        }
        break;

      case 'p':
        if (closing) flush();
        else if (!listStack.length) flush();
        break;

      default:
        break;
    }
  }

  flush();

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Full export payload: a title heading followed by the converted body. */
export function documentToMarkdown(title: string, contentHtml: string): string {
  const body = htmlToMarkdown(contentHtml);
  // Avoid a duplicate H1 when the body already opens with the document's title.
  if (body.startsWith(`# ${title}`)) return body;
  return `# ${title}\n\n${body}`;
}

/** RFC 6266-safe-ish filename for the Content-Disposition header. */
export function markdownFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'document'}.md`;
}
