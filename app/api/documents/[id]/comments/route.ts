import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { resolveAccess } from '@/lib/access';
import { internal, notFound, unauthenticated, validationFailed } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

const MAX_COMMENT_LENGTH = 2000;

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

/** GET → all comments on a document. Anyone with access may read them. */
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    return NextResponse.json({ comments: await listComments(id) });
  } catch (err) {
    return internal('GET /api/documents/:id/comments', err);
  }
}

/**
 * POST → add a comment.
 *
 * Note that a VIEWER may comment. That is deliberate: commenting is how a reviewer
 * participates without being given write access to the content, which is the entire point
 * of read-only sharing. Comments are stored separately from `contentHtml`, so allowing
 * this does not widen who can mutate the document itself.
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    const payload = await request.json().catch(() => null);
    const body = typeof payload?.body === 'string' ? payload.body.trim() : '';

    if (!body) return validationFailed('Write something before posting.');
    if (body.length > MAX_COMMENT_LENGTH) {
      return validationFailed(`Comments are limited to ${MAX_COMMENT_LENGTH} characters.`);
    }

    // Stored as plain text and rendered as plain text — never as HTML — so comments need
    // no sanitizer allowlist of their own.
    await prisma.comment.create({
      data: { documentId: id, authorId: session.userId, body },
    });

    return NextResponse.json({ comments: await listComments(id) }, { status: 201 });
  } catch (err) {
    return internal('POST /api/documents/:id/comments', err);
  }
}
