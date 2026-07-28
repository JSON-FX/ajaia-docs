# Ajaia Assignment — Build Spec

**Project:** Lightweight collaborative document editor (Google Docs–inspired)
**Timebox:** 5h build + 1h deliverables. Hard stop.
**Read this whole file before writing code.**

> ⚠️ **Verify the portal countdown before starting.** The submission portal shows
> `Time remaining: 225:24`. If that is **minutes**, you have 3h45m total — not 6h. In that
> case run the compressed plan in §10A instead of §10.

---

## 0. Context for the agent

This is a take-home assessment for an AI-Native Full Stack Developer role. It is graded on
**product judgment and scope discipline**, not feature count. The reviewers explicitly say:

> "Prioritize depth in a few important areas over shallow coverage everywhere."
> "Strong candidates usually make deliberate scope cuts and explain them clearly."

Therefore:

- **Do not add features beyond this spec.** If you think of a nice-to-have, add it to
  `notes.md` under "Deferred" instead of building it.
- **Do not relitigate the stack.** The decisions in §2 are final and were made for
  deploy-reliability reasons. If a decision genuinely blocks you, stop and ask.
- **Ship early, ship often.** A deployed 80% build beats a local 100% build. Deploy in
  Phase 0 and keep `main` green.
- **Keep `notes.md` updated as you go** (see §11). It feeds a graded deliverable.

---

## 1. Scope: what we build and what we refuse

### IN SCOPE

| # | Feature | Depth |
|---|---------|-------|
| 1 | Mock auth via seeded users | Shallow — email-only, signed cookie |
| 2 | Dashboard: My Documents / Shared With Me | Medium — must visibly distinguish |
| 3 | Rich-text editor (TipTap) | **Deep** — bold, italic, underline, H1/H2, bullet + numbered lists |
| 4 | Debounced autosave + manual save | Medium — with visible save status |
| 5 | Rename document | Shallow — inline title input |
| 6 | Upload `.txt` / `.md` / `.docx` → new editable document | **Deep** — parse, sanitize, validate |
| 7 | Share with another user (VIEWER / EDITOR) | **Deep** — single access chokepoint |
| 8 | Persistence (Postgres via Prisma) | Medium |
| 9 | Vitest suite over access control | **Deep** — this is the "meaningful test" |
| 10 | Export to Markdown | **Stretch only.** Build only after Phase 7 is complete and time remains. Never ahead of core work — the brief says "do not sacrifice core functionality to pursue stretch work." |

### OUT OF SCOPE — deliberate cuts, to be defended in writing

| Cut | Why |
|-----|-----|
| Real-time collaboration (CRDT/OT/websockets) | Would consume the entire timebox alone. Autosave with last-write-wins is honest and adequate for the brief. |
| Comments / suggestion mode | Second-order to core editing loop. |
| Version history | Requires a revisions table + diff UI; low demo value per hour. |
| Real auth (password hashing, OAuth, sessions store) | Brief explicitly permits mocked auth. Zero grading upside. |
| File/blob storage | Upload is parse-then-discard by design. See §6. |
| Public link sharing, org roles, folders, search, trash | Scope creep. |
| Mobile-responsive polish | Desktop-first is fine for a docs tool. Don't break on mobile, but don't optimize. |

**Note the collaboration cut prominently in ARCHITECTURE.md.** Stating it clearly scores
better than a half-broken presence indicator.

---

## 2. Stack — decided, do not change

| Layer | Choice | Rationale (reuse this in ARCHITECTURE.md) |
|-------|--------|-------------------------------------------|
| Framework | Next.js (App Router) + TypeScript | One deployable unit for FE + API; fastest path to a live URL. |
| DB | **Neon Postgres** (free tier) | Auto-suspends but wakes on request. Supabase free projects pause after extended idle — reviewers may open this days later and must not hit a dead app. |
| ORM | Prisma | Typed queries + trivial seeding. |
| Editor | **TipTap v2, free core only** | `StarterKit` + `Underline`. TipTap **Pro** extensions are paid — the brief forbids paid deps. Do not install anything under `@tiptap-pro/*`. |
| Sanitizer | `isomorphic-dompurify` | We persist user-supplied HTML; this is the XSS boundary. |
| Parsers | `mammoth` (.docx→HTML), `marked` (.md→HTML) | Both free, both server-side. |
| Tests | Vitest | Fast, zero-config with TS. |
| Deploy | Vercel (free) | Native Next.js target. |
| Styling | Tailwind | Speed. |

**No paid dependency or service may be required to review this app.**

---

## 3. Data model

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

enum ShareRole {
  VIEWER
  EDITOR
}
```

### Seed (`prisma/seed.ts`)

Three users — reviewers need at least two to exercise sharing:

- `alice@ajaia.test` — Alice Reyes
- `bob@ajaia.test` — Bob Santos
- `carol@ajaia.test` — Carol Dimaano

Seed also:
- 2 documents owned by Alice, one with pre-populated rich content (headings, bold, a list)
  so the editor demos well on first open.
- 1 document owned by Bob, shared to Alice as `VIEWER` — so "Shared With Me" and
  read-only mode are non-empty on first login. **This matters: reviewers should see the
  sharing feature working before they configure anything.**

Make seed idempotent (`upsert`) so it can be re-run against prod safely.

---

## 4. Access control — the single chokepoint

Everything funnels through one function. **No route handler may query `Document` directly.**

```ts
// lib/access.ts
export type AccessRole = 'OWNER' | 'EDITOR' | 'VIEWER';

/** Returns the caller's role on a document, or null if they have no access at all. */
export async function resolveAccess(
  documentId: string,
  userId: string
): Promise<AccessRole | null>;

/** True if the role may mutate content or title. */
export function canEdit(role: AccessRole | null): boolean; // OWNER | EDITOR

/** True if the role may manage shares or delete the document. */
export function canManage(role: AccessRole | null): boolean; // OWNER only
```

Rules:
- Owner always wins, even if a stale share row also exists.
- No share row and not owner → `null` → route returns **404**, not 403 (do not leak
  document existence to non-members).
- Viewer attempting a mutation → **403**.

This function is the subject of the required automated test (§9). Design it to be pure
enough to test with a real DB or a mocked Prisma client — your call, but the test must be
real, not a snapshot.

---

## 5. API surface

Use **route handlers** (not server actions) for all mutations — easier for a reviewer to
read, easier to test, easier to demo in the video.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | — | Body `{ email }`. Verifies seeded user exists, sets signed httpOnly cookie. |
| POST | `/api/auth/logout` | session | Clears cookie. |
| GET | `/api/documents` | session | Returns `{ owned: [...], shared: [...] }`. Shared items include `owner.name` and `role`. |
| POST | `/api/documents` | session | Creates blank doc, returns `{ id }`. |
| GET | `/api/documents/:id` | access | Returns doc + caller's `role`. |
| PATCH | `/api/documents/:id` | canEdit | Body `{ title? , contentHtml? }`. Sanitizes HTML server-side. |
| DELETE | `/api/documents/:id` | canManage | Owner only. |
| GET | `/api/documents/:id/shares` | access | List current shares. |
| POST | `/api/documents/:id/shares` | canManage | Body `{ email, role }`. Upsert on `[documentId, userId]`. |
| DELETE | `/api/documents/:id/shares/:userId` | canManage | Revoke. |
| POST | `/api/upload` | session | Multipart. See §6. |
| GET | `/api/documents/:id/export` | access | Markdown download. **Stretch only.** |

### Session

Signed httpOnly cookie containing `userId`, signed with `SESSION_SECRET` (use `jose`).
Helper `getSession()` in `lib/session.ts` returns `{ userId } | null`. Unauthenticated API
calls → 401. Unauthenticated pages → redirect to `/login`.

This is intentionally not real auth. Say so in the README in one line.

---

## 6. Upload pipeline — parse and discard

**Design decision worth stating explicitly in ARCHITECTURE.md:** uploaded files are parsed
into HTML on the server and the original bytes are discarded. Nothing is stored on disk or
in object storage. This removes an entire infrastructure dependency (blob storage, signed
URLs, ephemeral-filesystem issues on serverless) with no loss of product value, because the
product need is *"turn this file into an editable document,"* not *"retain the file."*

Pipeline:

```
multipart upload
  → validate extension ∈ {.txt, .md, .docx}
  → validate size ≤ 2 MB
  → validate MIME loosely (do not trust it alone; extension + parse success is the real gate)
  → parse:
      .docx → mammoth.convertToHtml()
      .md   → marked.parse()
      .txt  → escape, split on blank lines, wrap each in <p>
  → DOMPurify.sanitize() with an allowlist matching what TipTap can render
  → strip empty result → reject with a clear message
  → create Document { title: filename without extension, contentHtml, ownerId: session.userId }
  → 201 { id }  → client redirects to /doc/:id
```

Sanitize allowlist (keep it tight, and keep it in one exported constant reused by `PATCH`):

```
tags:  p, br, strong, em, u, s, h1, h2, h3, ul, ol, li, blockquote, code, pre, a
attrs: href, target, rel
```

UI requirements:
- The upload control must state supported types and the size cap **in the UI**, not just
  the README. The brief calls this out specifically.
- Show a clear error for wrong type, oversize, corrupt file, and empty parse result.
- Loading state during parse (docx parse is not instant).

---

## 6A. Validation & error handling — explicitly graded

The brief lists "basic validation and error handling" as a minimum requirement. Upload
validation lives in §6; these are the rest. Keep them cheap — a shared helper, not a
schema-validation framework.

### API error contract

Every failing route returns the same shape, so the client can render errors uniformly:

```json
{ "error": { "code": "FORBIDDEN", "message": "You have view-only access to this document." } }
```

Codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`VALIDATION_FAILED` (400), `INTERNAL` (500). Never leak stack traces to the client.

### Field rules

| Field | Rule | On failure |
|-------|------|-----------|
| `title` | 1–200 chars, trimmed; empty → `"Untitled document"` | Coerce, don't error |
| `contentHtml` | ≤ 1 MB; sanitized through the §6 allowlist **on every write**, not just on upload | 400 if oversize |
| share `email` | Must match a seeded user | 400 `"No user found with that email."` |
| share `email` | Cannot be the owner's own email | 400 `"You already own this document."` |
| share `role` | Must be `VIEWER` or `EDITOR` | 400 |
| `:id` params | Unknown id → 404 (same response as no-access, per §4) | 404 |

### Client-side states

Every async surface needs all four: **loading, empty, error, success.** Specifically —
dashboard (both sections), editor load, save, upload, share modal. A visible
`Save failed — retry` state matters more than any other error path, because it is the one
a reviewer is most likely to trigger by going offline mid-demo.

Wrap the editor page in an error boundary so a malformed `contentHtml` cannot white-screen
the app.

---

## 7. Screens

### `/login`
Three one-click "Continue as Alice / Bob / Carol" buttons plus an email field.
Reviewers must be able to switch accounts in seconds to test sharing — this is a
deliberate reviewer-UX choice, mention it in the README.

### `/dashboard`
- Header: current user name, "Switch user" (logout), "New document", "Upload file".
- **My Documents** — cards/rows with title, updated-at, share count, delete.
- **Shared With Me** — same, plus **owner name** and a **role badge** (Viewer / Editor).
- Two visually distinct sections with headers. This satisfies the brief's "visible
  distinction between owned and shared documents."
- Empty states for both sections.

### `/doc/:id`
- Editable title input (autosaves on blur).
- Formatting toolbar: Bold, Italic, Underline, H1, H2, Paragraph, Bulleted list,
  Numbered list. Active-state highlighting on buttons.
- TipTap editor body.
- Save status indicator: `Saving… / All changes saved / Save failed — retry`.
- **Share** button (owner only) → modal: user picker or email input + role select, list of
  current shares with revoke.
- **Read-only mode for VIEWER:** toolbar hidden, editor `editable: false`, banner reading
  "You have view-only access to this document." Do not rely on hiding the UI alone — the
  server must reject the PATCH too.
- 404 page for no-access.

---

## 8. File structure

```
app/
  login/page.tsx
  dashboard/page.tsx
  doc/[id]/page.tsx
  api/
    auth/login/route.ts
    auth/logout/route.ts
    documents/route.ts
    documents/[id]/route.ts
    documents/[id]/shares/route.ts
    documents/[id]/shares/[userId]/route.ts
    upload/route.ts
components/
  Editor.tsx            // TipTap instance, editable flag from role
  Toolbar.tsx
  ShareModal.tsx
  UploadButton.tsx
  DocumentList.tsx
  SaveStatus.tsx
lib/
  prisma.ts
  session.ts
  access.ts             // resolveAccess, canEdit, canManage
  sanitize.ts           // allowlist + sanitizeHtml()
  parsers.ts            // docx / md / txt → html
prisma/
  schema.prisma
  seed.ts
tests/
  access.test.ts
  parsers.test.ts       // if time allows
README.md
ARCHITECTURE.md
AI_WORKFLOW.md
SUBMISSION.md
notes.md                // working file, not submitted
```

---

## 9. Required test

`tests/access.test.ts` — Vitest. Cover:

1. Owner on own doc → `OWNER`
2. User with EDITOR share → `EDITOR`
3. User with VIEWER share → `VIEWER`
4. Unrelated user → `null`
5. Owner who *also* has a stale share row → still `OWNER`
6. `canEdit(VIEWER)` → false; `canEdit(EDITOR)` → true; `canManage(EDITOR)` → false
7. **Integration-style:** PATCH as VIEWER → 403 (call the handler or hit the route)

Test #7 is the one that proves the permission model actually holds at the boundary, not
just in a unit. Prioritize it if time is short.

`npm test` must pass and must be documented in the README.

---

## 10. Build phases — deploy in Phase 0

| Phase | Time | Done when |
|-------|------|-----------|
| **0. Scaffold + deploy** | 0:00–0:30 | Next.js app, Tailwind, Prisma schema pushed to Neon, seed runs, **hello-world live on Vercel** |
| **1. Auth + dashboard** | 0:30–1:15 | Login as any seeded user; dashboard shows both sections with correct data |
| **2. Editor** | 1:15–2:30 | TipTap with all 7 formatting controls, debounced autosave (~800ms), rename, save status |
| **3. Upload** | 2:30–3:15 | All three file types → new doc, validation + errors, sanitized |
| **4. Sharing** | 3:15–4:00 | Share modal, roles, revoke, read-only viewer mode, server-side enforcement |
| **5. Tests + hardening** | 4:00–4:30 | Vitest green, empty states, error states, no console errors |
| **6. Docs** | 4:30–5:30 | README, ARCHITECTURE, AI_WORKFLOW, SUBMISSION |
| **7. Video** | 5:30–6:00 | 3–5 min walkthrough, two takes max |

**Rules:**
- Deploy at the end of every phase. `main` stays green.
- If a phase runs over by more than 15 minutes, cut something from it and move on. Note
  the cut in `notes.md`.
- Do not start Phase 6 late. Documentation is directly graded; a missing README costs more
  than a missing stretch feature.

---

## 10A. Compressed plan — only if the portal timer means 3h45m

Same phase order, same non-negotiables (deploy in Phase 0, docs still get written).
Cuts, in the order you should make them:

1. **Drop the share modal for a share bar** — an email input + role select + "Add" inline
   on the editor page, plus a plain list of current shares. Saves ~15 min.
2. **Drop `DELETE /api/documents/:id`** and the delete button. Not in the brief's
   requirements at all.
3. **Cut Vitest to `access.test.ts` only** — skip `parsers.test.ts`. One meaningful test
   is the stated minimum.
4. **Seed richer content** so you write less demo content on camera.
5. **Headings: H1 + Paragraph only** if the toolbar is fighting you. The brief says
   "headings *or* text size variation" — one heading level satisfies it.

Revised budget: 0:20 scaffold+deploy · 0:35 auth+dashboard · 1:00 editor · 0:35 upload ·
0:35 sharing · 0:20 test+hardening · 0:40 docs · 0:20 video ≈ 3h45m.

**Do not cut:** deployment, the access chokepoint, the one test, README, ARCHITECTURE,
AI_WORKFLOW, SUBMISSION, or the video. Those are all directly graded line items.

---

## 11. `notes.md` — keep this open from minute one

Append one line every time you:
- reject or materially rewrite AI-generated output
- make a tradeoff or scope cut
- hit a bug and how you caught it

This is the raw material for `AI_WORKFLOW.md`, which is graded on **specificity**.
Reconstructing it at hour five always reads generic. Concrete beats volume:

> ✅ "First-pass upload handler persisted mammoth's raw HTML output directly — added
> DOMPurify with an allowlist before the DB write, since we're storing user-supplied HTML."
> ❌ "AI helped with the upload feature."

---

## 12. Deliverables checklist — verify literally before submitting

Google Drive folder containing:

- [ ] Source code (zip or repo link — include both if possible)
- [ ] `README.md` — setup, env vars, `npm run` commands, seeded accounts with emails,
      supported upload types + size cap, one line stating auth is mocked
- [ ] `ARCHITECTURE.md` — stack rationale, data model, access-control chokepoint,
      parse-and-discard upload decision, **the collaboration cut and why**, plus the
      status block below
- [ ] `AI_WORKFLOW.md` — tools used, where AI materially sped things up, **what was changed
      or rejected**, how correctness/UX/reliability were verified
- [ ] `SUBMISSION.md` — literal manifest of everything in the folder
- [ ] `walkthrough-video.txt` — the unlisted Loom/YouTube URL
- [ ] Live deployment URL (also pinned at the top of the README)
- [ ] Seeded credentials for testing the sharing flow
- [ ] Screenshots or demo GIF

### Required status block — the brief asks for this by name

Put this in **both** `SUBMISSION.md` (reviewers read it first) and `ARCHITECTURE.md`.
All three headings are mandatory, including "What is working" — do not list only the gaps.

```markdown
## Status

### What is working
- <end-to-end capability, one line each — be specific, not aspirational>

### What is incomplete
- <partial or missing feature, and the honest reason>

### What I would build next with 2–4 more hours
1. <highest-value item first, with a one-line rationale>
2. ...
```

Good candidates for the "next 2–4 hours" list, roughly in priority order: presence
indicators via polling, document version history, share-by-link with expiry, PDF export,
optimistic-concurrency handling to replace last-write-wins.

**Final check:** open the live URL in a private window, log in as Alice, open the doc Bob
shared, confirm it's read-only, log in as Bob, share something with Carol. If that path
works cold, you're done.

---

## 13. Video outline (3–5 min)

1. **0:00–0:30** — What it is, one sentence on scope philosophy.
2. **0:30–2:00** — Main flow: create → format → autosave → reload → rename.
3. **2:00–2:45** — Upload a .docx → becomes an editable doc.
4. **2:45–3:45** — Share with Bob as Viewer → switch user → show read-only + server rejection.
5. **3:45–4:15** — **Key implementation decisions** (required beat): the single access
   chokepoint, parse-and-discard upload, sanitized HTML in Postgres.
6. **4:15–4:40** — What was deprioritized and why (lead with real-time collab).
7. **4:40–5:00** — AI workflow: one concrete example of AI output you rejected.

The brief lists five things the video must cover: main user flow, what works end to end,
what you deprioritized, key implementation decisions, and how AI supported your workflow.
Beats 2–4 carry the first two — say the words *"this is working end to end"* out loud as
you demo, so the reviewer can tick the box without inferring it.

Rehearse once. Don't debug on camera — if something breaks, cut and restart.
