import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { canManage, resolveAccess } from '@/lib/access';
import { forbidden, internal, notFound, unauthenticated } from '@/lib/errors';

type Context = { params: Promise<{ id: string; userId: string }> };

/** DELETE /api/documents/:id/shares/:userId → revoke access. Owner only. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id, userId } = await params;
    const role = await resolveAccess(id, session.userId);

    if (!role) return notFound();
    if (!canManage(role)) return forbidden('Only the owner can manage sharing.');

    await prisma.documentShare
      .delete({ where: { documentId_userId: { documentId: id, userId } } })
      // Already revoked — idempotent, not an error worth surfacing to the user.
      .catch(() => null);

    const shares = await prisma.documentShare.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({
      shares: shares.map((share) => ({
        userId: share.user.id,
        name: share.user.name,
        email: share.user.email,
        role: share.role,
      })),
    });
  } catch (err) {
    return internal('DELETE /api/documents/:id/shares/:userId', err);
  }
}
