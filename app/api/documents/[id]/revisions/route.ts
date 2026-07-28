import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { resolveAccess } from '@/lib/access';
import { internal, notFound, unauthenticated } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

/** GET /api/documents/:id/revisions → version history. Anyone with access may view it. */
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    const revisions = await prisma.documentRevision.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    });

    return NextResponse.json({
      revisions: revisions.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
        authorName: r.author?.name ?? 'Unknown',
      })),
      canRestore: role === 'OWNER' || role === 'EDITOR',
    });
  } catch (err) {
    return internal('GET /api/documents/:id/revisions', err);
  }
}
