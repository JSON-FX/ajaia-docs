import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Destructive reset back to the seeded demo state.
 *
 * `db:seed` is upsert-only on purpose — it is safe to re-run against production and never
 * deletes anything. That makes it the wrong tool for clearing up after a demo run, which
 * leaves behind uploaded documents, ad-hoc shares, and live comments.
 *
 * This deletes everything that is not part of the seed, then `db:reset` re-runs the seed
 * to restore the canonical rows. Anything with a `seed-` id survives.
 */

const SEED_DOCUMENT_IDS = [
  'seed-doc-alice-review',
  'seed-doc-alice-notes',
  'seed-doc-bob-contract',
];

const SEED_COMMENT_IDS = ['seed-comment-1', 'seed-comment-2'];
const SEED_REVISION_IDS = ['seed-revision-1', 'seed-revision-2'];

/** The only share the demo state should contain: Bob's contract, shared to Alice. */
const SEED_SHARE = { documentId: 'seed-doc-bob-contract', userEmail: 'alice@ajaia.test' };

async function main() {
  const alice = await prisma.user.findUnique({ where: { email: SEED_SHARE.userEmail } });

  // Documents first — cascades take their shares, comments, revisions and presence with them.
  const documents = await prisma.document.deleteMany({
    where: { id: { notIn: SEED_DOCUMENT_IDS } },
  });

  const shares = await prisma.documentShare.deleteMany({
    where: {
      NOT: {
        documentId: SEED_SHARE.documentId,
        userId: alice?.id ?? '__none__',
      },
    },
  });

  const comments = await prisma.comment.deleteMany({
    where: { id: { notIn: SEED_COMMENT_IDS } },
  });

  const revisions = await prisma.documentRevision.deleteMany({
    where: { id: { notIn: SEED_REVISION_IDS } },
  });

  const presence = await prisma.documentPresence.deleteMany({});

  console.log(
    `Removed ${documents.count} documents, ${shares.count} shares, ${comments.count} comments, ` +
      `${revisions.count} revisions, ${presence.count} presence rows.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
