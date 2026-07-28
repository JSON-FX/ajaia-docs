import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { canEdit, resolveAccess } from '@/lib/access';
import { sanitizeHtml } from '@/lib/sanitize';
import { forbidden, internal, notFound, unauthenticated } from '@/lib/errors';

type Context = { params: Promise<{ id: string; revisionId: string }> };

/** GET → preview a single revision's content. */
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id, revisionId } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    const revision = await prisma.documentRevision.findFirst({
      // Scoped by documentId as well as id, so a revision id from another document
      // cannot be read through a document the caller happens to have access to.
      where: { id: revisionId, documentId: id },
      select: {
        id: true,
        title: true,
        contentHtml: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    });

    if (!revision) return notFound();

    // Already sanitised before it was ever stored. Re-sanitising here is a no-op in
    // practice, but it keeps the guarantee local to the response that gets rendered with
    // dangerouslySetInnerHTML rather than resting on an invariant established elsewhere.
    return NextResponse.json({
      revision: { ...revision, contentHtml: sanitizeHtml(revision.contentHtml) },
    });
  } catch (err) {
    return internal('GET /api/documents/:id/revisions/:revisionId', err);
  }
}

/** POST → restore this revision as the document's current content. Requires edit rights. */
export async function POST(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id, revisionId } = await params;
    const role = await resolveAccess(id, session.userId);

    if (!role) return notFound();
    if (!canEdit(role)) return forbidden('You have view-only access to this document.');

    const revision = await prisma.documentRevision.findFirst({
      where: { id: revisionId, documentId: id },
      select: { title: true, contentHtml: true },
    });

    if (!revision) return notFound();

    // Snapshot the state we are about to replace, so "restore" is itself undoable.
    const current = await prisma.document.findUnique({
      where: { id },
      select: { title: true, contentHtml: true },
    });

    if (current) {
      await prisma.documentRevision.create({
        data: {
          documentId: id,
          authorId: session.userId,
          title: current.title,
          contentHtml: current.contentHtml,
        },
      });
    }

    // Content came from our own sanitized column, so it is already clean.
    const updated = await prisma.document.update({
      where: { id },
      data: { title: revision.title, contentHtml: revision.contentHtml },
      select: { id: true, title: true, contentHtml: true, updatedAt: true },
    });

    return NextResponse.json({ document: updated });
  } catch (err) {
    return internal('POST /api/documents/:id/revisions/:revisionId', err);
  }
}
