import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotent (upsert-only) so it can be re-run against production safely.
 *
 * Documents are keyed by a fixed id rather than cuid() for exactly that reason — a second
 * run updates the same three rows instead of piling up duplicates every deploy.
 */

const USERS = [
  { id: 'seed-user-alice', email: 'alice@ajaia.test', name: 'Alice Reyes' },
  { id: 'seed-user-bob', email: 'bob@ajaia.test', name: 'Bob Santos' },
  { id: 'seed-user-carol', email: 'carol@ajaia.test', name: 'Carol Dimaano' },
];

const ALICE_RICH_DOC = `
<h1>Q3 Product Review</h1>
<p>This document is <strong>seeded content</strong>, so the editor has something to show the moment you open it. Everything here is editable — try the toolbar above.</p>
<h2>What shipped</h2>
<ul>
<li>Rich-text editing with <strong>bold</strong>, <em>italic</em>, and <u>underline</u></li>
<li>Debounced autosave — stop typing for a moment and watch the status change</li>
<li>Upload a <code>.docx</code>, <code>.md</code>, or <code>.txt</code> file to create a new document</li>
</ul>
<h2>Open questions</h2>
<ol>
<li>Do we need per-paragraph comments before launch?</li>
<li>How should version history interact with sharing?</li>
</ol>
<blockquote><p>Scope discipline beats feature count.</p></blockquote>
`.trim();

const ALICE_PLAIN_DOC = `
<h1>Meeting notes — 12 Nov</h1>
<p>Attendees: Alice, Bob, Carol.</p>
<ul>
<li>Agreed to cut real-time collaboration from v1</li>
<li>Autosave with last-write-wins is acceptable for the current use case</li>
</ul>
<p>Next check-in is Thursday.</p>
`.trim();

const BOB_SHARED_DOC = `
<h1>Vendor contract review</h1>
<p>Bob owns this document and has shared it with Alice as a <strong>Viewer</strong>.</p>
<p>If you are signed in as Alice, the toolbar is hidden and the editor is read-only — and the server rejects edits too, not just the UI. Sign in as Bob to edit it.</p>
<h2>Terms to confirm</h2>
<ol>
<li>Payment schedule — net 30 vs net 45</li>
<li>Termination notice period</li>
</ol>
`.trim();

async function main() {
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name },
      create: user,
    });
  }

  const alice = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@ajaia.test' } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { email: 'bob@ajaia.test' } });

  const documents = [
    {
      id: 'seed-doc-alice-review',
      title: 'Q3 Product Review',
      contentHtml: ALICE_RICH_DOC,
      ownerId: alice.id,
    },
    {
      id: 'seed-doc-alice-notes',
      title: 'Meeting notes — 12 Nov',
      contentHtml: ALICE_PLAIN_DOC,
      ownerId: alice.id,
    },
    {
      id: 'seed-doc-bob-contract',
      title: 'Vendor contract review',
      contentHtml: BOB_SHARED_DOC,
      ownerId: bob.id,
    },
  ];

  for (const doc of documents) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: { title: doc.title, contentHtml: doc.contentHtml, ownerId: doc.ownerId },
      create: doc,
    });
  }

  // Bob's document shared to Alice as VIEWER, so "Shared With Me" and read-only mode are
  // both non-empty on a reviewer's very first login, before they configure anything.
  await prisma.documentShare.upsert({
    where: {
      documentId_userId: { documentId: 'seed-doc-bob-contract', userId: alice.id },
    },
    update: { role: 'VIEWER' },
    create: {
      documentId: 'seed-doc-bob-contract',
      userId: alice.id,
      role: 'VIEWER',
    },
  });

  console.log('Seeded 3 users, 3 documents, 1 share.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
