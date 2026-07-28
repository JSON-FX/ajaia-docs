import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { resolveAccess } from '@/lib/access';
import { forbidden, internal, notFound, unauthenticated } from '@/lib/errors';

type Context = { params: Promise<{ id: string; commentId: string }> };

async function listComments(documentId: string) {
  const comments = await prisma.comment.findMany({
    where: { documentId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      body: true,
      resolved: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  });

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    resolved: c.resolved,
    createdAt: c.createdAt,
    authorId: c.author.id,
    authorName: c.author.name,
  }));
}

/** PATCH → toggle resolved. Anyone with access may resolve, as in most doc tools. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id, commentId } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    const payload = await request.json().catch(() => null);
    const resolved = Boolean(payload?.resolved);

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, documentId: id },
      select: { id: true },
    });
    if (!comment) return notFound();

    await prisma.comment.update({ where: { id: commentId }, data: { resolved } });

    return NextResponse.json({ comments: await listComments(id) });
  } catch (err) {
    return internal('PATCH /api/documents/:id/comments/:commentId', err);
  }
}

/** DELETE → remove a comment. Only its author or the document owner. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id, commentId } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, documentId: id },
      select: { authorId: true },
    });
    if (!comment) return notFound();

    if (comment.authorId !== session.userId && role !== 'OWNER') {
      return forbidden('You can only delete your own comments.');
    }

    await prisma.comment.delete({ where: { id: commentId } });

    return NextResponse.json({ comments: await listComments(id) });
  } catch (err) {
    return internal('DELETE /api/documents/:id/comments/:commentId', err);
  }
}
