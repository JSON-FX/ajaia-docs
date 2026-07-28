import { prisma } from './prisma';
import type { PrismaClient } from '@prisma/client';

/**
 * THE ACCESS CHOKEPOINT (spec §4).
 *
 * Every read and every mutation of a Document resolves permission here first. No route
 * handler queries `Document` directly — that rule is what makes the permission model
 * auditable: there is exactly one function to read, and exactly one function to test.
 *
 * The alternative (each route doing its own `where: { ownerId }` filter) is how
 * authorisation bugs happen — one forgotten clause in one handler and the model is broken
 * with nothing to point at.
 */

export type AccessRole = 'OWNER' | 'EDITOR' | 'VIEWER';

/** Minimal surface of the Prisma client this module needs — lets tests pass a fake. */
export type AccessDb = Pick<PrismaClient, 'document' | 'documentShare'>;

/**
 * Returns the caller's role on a document, or null when they have no access at all.
 *
 * null is deliberately ambiguous between "no such document" and "not shared with you";
 * callers turn both into a 404 so the API never confirms that a document exists to
 * someone who isn't a member of it.
 */
export async function resolveAccess(
  documentId: string,
  userId: string,
  db: AccessDb = prisma
): Promise<AccessRole | null> {
  if (!documentId || !userId) return null;

  const document = await db.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true },
  });

  if (!document) return null;

  // Ownership wins unconditionally. A stale DocumentShare row pointing at the owner —
  // possible if a doc was shared and later transferred — must not downgrade them.
  if (document.ownerId === userId) return 'OWNER';

  const share = await db.documentShare.findUnique({
    where: { documentId_userId: { documentId, userId } },
    select: { role: true },
  });

  if (!share) return null;
  return share.role === 'EDITOR' ? 'EDITOR' : 'VIEWER';
}

/** May mutate content or title. */
export function canEdit(role: AccessRole | null): boolean {
  return role === 'OWNER' || role === 'EDITOR';
}

/** May manage shares or delete the document. Owner only. */
export function canManage(role: AccessRole | null): boolean {
  return role === 'OWNER';
}
