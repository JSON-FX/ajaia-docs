import { prisma } from './prisma';

/**
 * Version history.
 *
 * The hard part is not storing snapshots — it is not storing too many. Autosave fires
 * 800ms after typing stops, so a naive "snapshot on every PATCH" would write a row every
 * few seconds of drafting and produce a history nobody can read.
 *
 * So snapshots are coalesced: we record the document's state *before* an edit, but only
 * if the newest existing snapshot is older than COALESCE_WINDOW. The effect is roughly
 * "one entry per editing session" rather than one per keystroke burst, which is what makes
 * the list useful to a human.
 */

/** Snapshots closer together than this are treated as one editing session. */
export const COALESCE_WINDOW_MS = 45_000;

/** Keep history bounded — old entries beyond this are pruned per document. */
export const MAX_REVISIONS_PER_DOCUMENT = 30;

/**
 * Records the CURRENT (pre-edit) state of a document as a revision, if enough time has
 * passed since the last one. Call this immediately before applying an update.
 */
export async function snapshotBeforeEdit(
  documentId: string,
  authorId: string,
  current: { title: string; contentHtml: string }
): Promise<void> {
  const latest = await prisma.documentRevision.findFirst({
    where: { documentId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, contentHtml: true, title: true },
  });

  if (latest) {
    const age = Date.now() - latest.createdAt.getTime();
    if (age < COALESCE_WINDOW_MS) return;
    // Nothing actually changed since the last snapshot — don't store a duplicate.
    if (latest.contentHtml === current.contentHtml && latest.title === current.title) return;
  }

  await prisma.documentRevision.create({
    data: {
      documentId,
      authorId,
      title: current.title,
      contentHtml: current.contentHtml,
    },
  });

  await pruneRevisions(documentId);
}

async function pruneRevisions(documentId: string): Promise<void> {
  const surplus = await prisma.documentRevision.findMany({
    where: { documentId },
    orderBy: { createdAt: 'desc' },
    skip: MAX_REVISIONS_PER_DOCUMENT,
    select: { id: true },
  });

  if (surplus.length === 0) return;

  await prisma.documentRevision.deleteMany({
    where: { id: { in: surplus.map((r) => r.id) } },
  });
}
