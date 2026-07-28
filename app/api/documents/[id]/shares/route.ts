import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { canManage, resolveAccess } from '@/lib/access';
import { forbidden, internal, notFound, unauthenticated, validationFailed } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

async function listShares(documentId: string) {
  const shares = await prisma.documentShare.findMany({
    where: { documentId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return shares.map((share) => ({
    userId: share.user.id,
    name: share.user.name,
    email: share.user.email,
    role: share.role,
  }));
}

/** GET /api/documents/:id/shares → anyone with access may see who else has access. */
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    return NextResponse.json({ shares: await listShares(id) });
  } catch (err) {
    return internal('GET /api/documents/:id/shares', err);
  }
}

/** POST /api/documents/:id/shares → grant access. Owner only. */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);

    if (!role) return notFound();
    if (!canManage(role)) return forbidden('Only the owner can share this document.');

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const shareRole = body?.role;

    if (!email) return validationFailed('Enter an email address.');
    if (shareRole !== 'VIEWER' && shareRole !== 'EDITOR') {
      return validationFailed('Role must be VIEWER or EDITOR.');
    }

    const target = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!target) return validationFailed('No user found with that email.');
    if (target.id === session.userId) return validationFailed('You already own this document.');

    // Upsert on [documentId, userId] so re-sharing changes the role instead of erroring
    // on the unique constraint.
    await prisma.documentShare.upsert({
      where: { documentId_userId: { documentId: id, userId: target.id } },
      update: { role: shareRole },
      create: { documentId: id, userId: target.id, role: shareRole },
    });

    return NextResponse.json({ shares: await listShares(id) }, { status: 201 });
  } catch (err) {
    return internal('POST /api/documents/:id/shares', err);
  }
}
