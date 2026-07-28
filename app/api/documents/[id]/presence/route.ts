import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { resolveAccess } from '@/lib/access';
import { internal, notFound, unauthenticated } from '@/lib/errors';

type Context = { params: Promise<{ id: string }> };

/**
 * Presence, by polling.
 *
 * This is NOT real-time collaboration — there is no shared editing state and no conflict
 * resolution. It answers one question: who else has this document open right now. That is
 * the part of collaboration worth having at this scale, and it is honest about what it is.
 *
 * Serverless functions share no memory between invocations, so "who is here" has to be
 * durable. Each client POSTs a heartbeat and is considered present for PRESENCE_TTL_MS
 * after its last beat.
 */

const PRESENCE_TTL_MS = 20_000;

async function activeViewers(documentId: string, excludeUserId: string) {
  const cutoff = new Date(Date.now() - PRESENCE_TTL_MS);

  const rows = await prisma.documentPresence.findMany({
    where: {
      documentId,
      lastSeenAt: { gte: cutoff },
      userId: { not: excludeUserId },
    },
    orderBy: { lastSeenAt: 'desc' },
    select: { userId: true, lastSeenAt: true, user: { select: { name: true } } },
  });

  return rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    lastSeenAt: row.lastSeenAt,
  }));
}

/** POST → heartbeat, and get back everyone else currently viewing. */
export async function POST(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;
    const role = await resolveAccess(id, session.userId);
    if (!role) return notFound();

    await prisma.documentPresence.upsert({
      where: { documentId_userId: { documentId: id, userId: session.userId } },
      // lastSeenAt is @updatedAt, so it needs a write to move; setting documentId to
      // itself is a no-op update that still bumps the timestamp.
      update: { documentId: id },
      create: { documentId: id, userId: session.userId },
    });

    return NextResponse.json({ viewers: await activeViewers(id, session.userId) });
  } catch (err) {
    return internal('POST /api/documents/:id/presence', err);
  }
}

/** DELETE → leave immediately rather than waiting for the heartbeat to lapse. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const session = await getSession();
    if (!session) return unauthenticated();

    const { id } = await params;

    await prisma.documentPresence
      .delete({ where: { documentId_userId: { documentId: id, userId: session.userId } } })
      .catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internal('DELETE /api/documents/:id/presence', err);
  }
}
