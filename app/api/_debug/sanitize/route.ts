import { NextResponse } from 'next/server';

/**
 * TEMPORARY diagnostic. Reports why the sanitizer module fails to load in a deployed
 * serverless function, since the platform only surfaces an opaque 500. Delete once the
 * sanitize import is confirmed working in production.
 */
export async function GET() {
  const report: Record<string, unknown> = { runtime: process.version };

  try {
    const mod = await import('isomorphic-dompurify');
    const DOMPurify = (mod.default ?? mod) as { sanitize: (s: string) => string };
    report.importedIsomorphicDompurify = true;
    report.sanitizeSmokeTest = DOMPurify.sanitize('<p>ok</p><script>bad()</script>');
  } catch (err) {
    report.importedIsomorphicDompurify = false;
    report.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    report.stackHead =
      err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : null;
  }

  try {
    const { sanitizeHtml } = await import('@/lib/sanitize');
    report.importedLibSanitize = true;
    report.libSanitizeOutput = sanitizeHtml('<p>ok</p><img src=x onerror="alert(1)">');
  } catch (err) {
    report.importedLibSanitize = false;
    report.libSanitizeError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  return NextResponse.json(report);
}
