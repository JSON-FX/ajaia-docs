import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { resolveAccess } from '@/lib/access';
import { documentToMarkdown, markdownFilename } from '@/lib/markdown';
import { internal, notFound, unauthenticated } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

/** GET /api/documents/:id/export → Markdown download. Any level of access may export. */
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    const document = await prisma.document.findUnique({
      where: { id },
      select: { title: true, contentHtml: true },
    });
    if (!document) return notFound();

    const markdown = documentToMarkdown(document.title, document.contentHtml);

    return new NextResponse(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${markdownFilename(document.title)}"`,
      },
    });
  } catch (err) {
    return internal('GET /api/documents/:id/export', err);
  }
}
