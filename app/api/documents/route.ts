import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { internal, unauthenticated } from '@/lib/errors';

/** GET /api/documents → { owned, shared } for the dashboard's two sections. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const [owned, shares] = await Promise.all([
      prisma.document.findMany({
        where: { ownerId: session.userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          _count: { select: { shares: true } },
        },
      }),
      prisma.documentShare.findMany({
        where: { userId: session.userId },
        orderBy: { document: { updatedAt: 'desc' } },
        select: {
          role: true,
          document: {
            select: {
              id: true,
              title: true,
              updatedAt: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      owned: owned.map((doc) => ({
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updatedAt,
        shareCount: doc._count.shares,
      })),
      shared: shares.map((share) => ({
        id: share.document.id,
        title: share.document.title,
        updatedAt: share.document.updatedAt,
        role: share.role,
        owner: share.document.owner,
      })),
    });
  } catch (err) {
    return internal('GET /api/documents', err);
  }
}

/** POST /api/documents → creates a blank document owned by the caller. */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const document = await prisma.document.create({
      data: { ownerId: session.userId },
      select: { id: true },
    });

    return NextResponse.json({ id: document.id }, { status: 201 });
  } catch (err) {
    return internal('POST /api/documents', err);
  }
}
