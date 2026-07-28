# Architecture

## Status

### What is working

- Sign in as any of three seeded users and switch accounts in one click; session is a
  signed httpOnly cookie, verified on every API call.
- Dashboard lists **My documents** and **Shared with me** as two visually distinct
  sections, with owner name and a Viewer/Editor role badge on shared items, share counts
  on owned items, and empty states for both.
- Create a blank document, edit it with bold / italic / underline / H1 / H2 / paragraph /
  bulleted list / numbered list, and rename it inline. Changes autosave 800 ms after you
  stop typing, with a visible `Saving… / All changes saved / Save failed — Retry` status.
  Edits survive a reload.
- Upload `.txt`, `.md`, or `.docx` and get a new editable document. Wrong type, empty
  file, oversize file, corrupt `.docx`, and a file that parses to nothing each produce a
  specific error message.
- Share a document by email as Viewer or Editor, see everyone with access, and revoke it.
- Viewers get a read-only editor with the toolbar hidden and an explanatory banner — and
  the server rejects their writes with 403 regardless of the UI.
- 21 automated tests pass with `npm test`, including a test that drives the real PATCH
  route handler to prove a Viewer is rejected at the HTTP boundary.

### What is incomplete

- **No real-time collaboration.** Two people editing the same document at the same time
  will overwrite each other — last write wins. This was cut deliberately; see below.
- **Auth is mocked.** No passwords, no OAuth, no session store. Anyone who knows a seeded
  email can sign in as that user. The brief permits this explicitly.
- **No document deletion.** Cut under the compressed timebox; it was not in the brief's
  requirements. The API and the access chokepoint already support it via `canManage` —
  it is a route handler and a button, not a design change.
- **No Markdown export.** This was listed as stretch-only, to be built after core work.
  Core work plus verification consumed the timebox.
- **Desktop-first.** The layout does not break on a phone but was not optimised for one.
- **No pagination.** The dashboard loads every document a user can see. Fine at seeded
  scale, wrong at a thousand.

### What I would build next with 2–4 more hours

1. **Optimistic-concurrency handling to replace last-write-wins.** Send the document's
   `updatedAt` with each PATCH and reject the write if it has moved; show the user a
   "this document changed elsewhere" prompt. This is the honest fix for the biggest
   correctness gap, and it is far cheaper than real-time collaboration.
2. **Presence indicators via polling.** A 5-second poll showing who else has the document
   open. Buys most of the perceived value of collaboration for a fraction of the cost of
   a CRDT, and makes the last-write-wins risk visible rather than silent.
3. **Document version history.** A `DocumentRevision` row per save-settle, with restore.
   Directly mitigates the same overwrite risk and is a genuinely useful editor feature.
4. **Share-by-link with expiry.** The most-requested sharing feature in real products,
   and the data model already funnels through one access resolver, so it is an additional
   branch in `resolveAccess` rather than a rewrite.
5. **PDF export.** Higher user demand than Markdown export, but needs a rendering
   dependency, so it lands behind the items above.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js (App Router) + TypeScript | One deployable unit for frontend and API — the fastest path to a live URL, which matters more than architectural purity in a timeboxed build. |
| Database | Neon Postgres (free tier) | Auto-suspends but wakes on request. Reviewers may open this days later and must not hit a dead app; Supabase free projects pause after extended idle. |
| ORM | Prisma | Typed queries and trivial seeding. Also made swapping from a local Docker Postgres to Neon a one-line change mid-build. |
| Editor | TipTap v2, free core only | `StarterKit` + `Underline`. Nothing from `@tiptap-pro/*` — the brief forbids paid dependencies. |
| Sanitizer | `sanitize-html` | We persist user-supplied HTML. This is the XSS boundary. Started on `isomorphic-dompurify` per the original plan; it broke in production — see below. |
| Parsers | `mammoth` (.docx), `marked` (.md) | Both free, both server-side. |
| Tests | Vitest | Fast, zero-config with TypeScript. |
| Styling | Tailwind | Speed. |
| Deploy | Vercel | Native Next.js target. |

No paid dependency or service is required to review this app.

**The sanitizer was changed after deployment, not before.** The plan specified
`isomorphic-dompurify`, and it worked locally in both dev and `next start`. On Vercel it
failed: that package depends on jsdom, which resolves internals through dynamic requires
that neither Turbopack nor webpack could trace into a serverless bundle. Every route
importing `lib/sanitize.ts` threw at module load, so `PATCH /api/documents/:id` and
`POST /api/upload` both returned an opaque 500 while routes that did not import it were
fine — saving a document was broken in production. `serverExternalPackages` and a webpack
production build were each tried and neither fixed it. `sanitize-html` is pure JavaScript
with no DOM emulation, so there is nothing to fail to bundle. It is allowlist-based in the
same way, and its output was verified byte-for-byte identical to DOMPurify's across all 12
payloads in `tests/sanitize.test.ts` before the swap was committed.

**Two versions were pinned deliberately.** Prisma installed as v7, which removed `url`
from the datasource block in favour of a `prisma.config.ts` and a driver adapter; that is
a newer, thinner-documented path, so the build pinned **Prisma 6**, which the schema in
the brief targets. TipTap is pinned to **v2** as specified — worth knowing that v3's
`StarterKit` bundles `Underline` while v2's does not, hence the separate
`@tiptap/extension-underline` dependency.

---

## Data model

Three tables. `User` owns many `Document`s; `DocumentShare` is the join table carrying a
role.

```prisma
model User {
  id        String          @id @default(cuid())
  email     String          @unique
  name      String
  documents Document[]      @relation("OwnedDocuments")
  shares    DocumentShare[]
  createdAt DateTime        @default(now())
}

model Document {
  id          String          @id @default(cuid())
  title       String          @default("Untitled document")
  contentHtml String          @default("<p></p>") @db.Text
  ownerId     String
  owner       User            @relation("OwnedDocuments", fields: [ownerId], references: [id], onDelete: Cascade)
  shares      DocumentShare[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([ownerId])
}

model DocumentShare {
  id         String    @id @default(cuid())
  documentId String
  document   Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role       ShareRole @default(VIEWER)
  createdAt  DateTime  @default(now())

  @@unique([documentId, userId])
  @@index([userId])
}

enum ShareRole { VIEWER  EDITOR }
```

Notes on the shape:

- **Ownership lives on `Document.ownerId`, not in a share row.** An owner is not a special
  kind of share; making it one would mean every document needs a share row to be usable,
  and deleting the wrong row would orphan a document.
- **`@@unique([documentId, userId])`** means sharing is idempotent. Re-sharing to the same
  person changes their role via an upsert instead of erroring or creating a duplicate.
- **Content is stored as sanitised HTML**, not as a JSON document tree. HTML is what TipTap
  emits and what the parsers produce, so one representation serves editing, upload, and
  rendering. The tradeoff is that HTML is a worse merge target — which is acceptable
  precisely because we are not merging concurrent edits (see the collaboration cut).
- **`onDelete: Cascade`** everywhere, so deleting a user or document cannot leave dangling
  share rows that would confuse the access resolver.

---

## The access-control chokepoint

**Every read and every mutation of a document resolves permission through one function.
No route handler queries `Document` directly.**

```ts
// lib/access.ts
export type AccessRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export async function resolveAccess(
  documentId: string,
  userId: string,
  db: AccessDb = prisma
): Promise<AccessRole | null>;

export function canEdit(role: AccessRole | null): boolean;   // OWNER | EDITOR
export function canManage(role: AccessRole | null): boolean; // OWNER only
```

The alternative — each route applying its own `where: { ownerId }` filter — is how
authorisation bugs actually happen. One forgotten clause in one handler and the model is
broken, with no single place to look and nothing meaningful to test. Here there is exactly
one function to read and one to test, and the editor *page* uses the same resolver as the
API, so the server-rendered view cannot drift more permissive than the endpoints.

Three rules it enforces:

- **Owner always wins**, even when a stale share row also names them. Without this, a share
  row that outlived an ownership change would silently demote an owner to read-only on
  their own document.
- **No access returns `null`, and callers turn that into 404 — never 403.** A 403 would
  confirm that a document exists to someone who is not a member of it. Unknown IDs and
  forbidden IDs are deliberately indistinguishable.
- **A Viewer attempting a mutation gets 403**, because a Viewer already knows the document
  exists, so there is nothing left to leak.

The third parameter defaults to the real Prisma client but accepts any object with the
same narrow shape. That is what lets `tests/access.test.ts` run the genuine resolver
against an in-memory fake — the tests need no database and still exercise real logic.

### Verified permission matrix

Each of these was exercised against the running app, not just reasoned about:

| Actor | Read | Edit (PATCH) | Manage shares |
|-------|------|--------------|---------------|
| Owner | ✅ | ✅ 200 | ✅ |
| Editor | ✅ | ✅ 200 | ❌ 403 |
| Viewer | ✅ | ❌ 403 | ❌ 403 |
| Non-member | ❌ 404 | ❌ 404 | ❌ 404 |
| Signed out | ❌ 401 | ❌ 401 | ❌ 401 |

---

## Upload: parse and discard

Uploaded files are parsed into HTML on the server and **the original bytes are discarded**.
Nothing is written to disk or object storage.

```
multipart upload
  → validate extension ∈ {.txt, .md, .docx}
  → validate size ≤ 2 MB, reject empty
  → parse:  .docx → mammoth   |   .md → marked   |   .txt → escape + wrap in <p>
  → DOMPurify.sanitize() against the shared allowlist
  → reject if the result has no readable text
  → create Document { title: filename stem, contentHtml, ownerId }
  → 201 { id } → client redirects to /doc/:id
```

This removes an entire infrastructure dependency — blob storage, signed URLs, and the
ephemeral-filesystem problem serverless platforms have — at no cost to the product,
because the user's need is *"turn this file into an editable document,"* not *"keep my
file."* Retaining the original would create an obligation (storage lifecycle, access
control on a second resource, deletion semantics) that nothing in the product would use.

**MIME type is never the gate.** Extension plus a *successful parse* is. A `.txt` renamed
to `.docx` announces itself as a Word document and is caught only when mammoth fails to
read it as an OOXML package — which it does, producing a clear error rather than a 500.

### Sanitisation is the same boundary on every path

One exported allowlist in `lib/sanitize.ts` is used by both `POST /api/upload` and
`PATCH /api/documents/:id`, so the two write paths cannot drift apart:

```
tags:  p br strong em u s h1 h2 h3 ul ol li blockquote code pre a
attrs: href target rel
```

Sanitising on **every write** matters because the editor is not the only way to reach the
API. A client-side-only sanitiser is bypassed by one `curl`. This allowlist deliberately
mirrors exactly what our TipTap configuration can render — anything else is noise at best
and an injection vector at worst.

---

## Deliberate cuts

### Real-time collaboration — the headline cut

**Not built. This is the most significant thing missing, and it was cut on purpose.**

Real-time collaborative editing means CRDTs or operational transforms, a websocket
transport, presence, cursor rendering, and offline reconciliation. It would have consumed
the entire timebox on its own and still landed half-finished. A half-working presence
indicator that flickers, or a merge that silently drops a paragraph, is worse than an
honest absence — it looks like a feature while behaving like a bug.

What is here instead: debounced autosave with **last-write-wins**. For the actual usage
this product supports — people working on documents at different times, sharing them for
review — that is adequate and, importantly, predictable. The failure mode is
understandable ("the last save wins") rather than mysterious.

The right next step is *not* to start building CRDTs. It is optimistic concurrency: send
`updatedAt` with each write, reject stale ones, and tell the user. That converts a silent
overwrite into a visible, recoverable conflict for a fraction of the effort — which is why
it is first on the list above.

### Also cut, and why

| Cut | Reason |
|-----|--------|
| Comments / suggestion mode | Second-order to the core editing loop. |
| Version history | Needs a revisions table plus diff UI; low demo value per hour, though it is high on the "next" list. |
| Real auth | The brief explicitly permits mocked auth. Zero grading upside, real cost. |
| File/blob storage | Upload is parse-then-discard by design, as above. |
| Public link sharing, org roles, folders, search, trash | Scope creep. |
| Document deletion | Cut under the compressed timebox; not in the brief's requirements. |
| Mobile-responsive polish | Desktop-first is right for a documents tool. It does not break on mobile; it is not optimised for it. |

The timebox was **~3h40m**, not 6h — the submission portal's countdown was in minutes. The
build followed the brief's own compressed plan: an inline share bar instead of a modal,
and no delete route. Documentation, the access chokepoint, the tests, and deployment were
treated as non-negotiable.

---

## Error handling

Every failing route returns the same envelope, so the client renders errors uniformly:

```json
{ "error": { "code": "FORBIDDEN", "message": "You have view-only access to this document." } }
```

Codes map to status: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404,
`VALIDATION_FAILED` 400, `INTERNAL` 500. Internal errors log server-side and return an
opaque message — no stack traces reach the client.

A single `apiFetch` wrapper unwraps that envelope on the client, so no component hand-rolls
error parsing and every one of them gets a guaranteed user-facing message. Loading, empty,
error, and success states exist on the dashboard, editor load, save, upload, and share
surfaces. The editor route is wrapped in an error boundary so malformed content cannot
white-screen the app, and `Save failed — Retry` preserves the unsaved payload so the retry
has something to send.
