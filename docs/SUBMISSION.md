# Submission — Ajaia Docs

A lightweight collaborative document editor, built for the AI-Native Full Stack Developer
assignment.

| | |
|---|---|
| **Live app** | **https://ajaia-docs-assessment-jayson-alanano.vercel.app** |
| **Repository** | **https://github.com/JSON-FX/ajaia-docs** |
| **Walkthrough video** | see `walkthrough-video.txt` |
| **Sign in as** | `alice@ajaia.test` — one click, no password |

---

## Status

### What is working

- Sign in as any of three seeded users and switch accounts in one click; the session is a
  signed httpOnly cookie, verified on every API call.
- Dashboard shows **My documents** and **Shared with me** as two visually distinct
  sections — shared items carry the owner's name and a Viewer/Editor badge, owned items
  carry a share count, and both have empty states.
- Create a document, format it with bold / italic / underline / H1 / H2 / paragraph /
  bulleted list / numbered list, and rename it inline. Edits autosave 800 ms after typing
  stops, with a visible `Saving… / All changes saved / Save failed — Retry` status, and
  they survive a reload.
- Upload `.txt`, `.md`, or `.docx` and get a new editable document. Wrong type, empty
  file, oversize file, corrupt `.docx`, and a file that parses to nothing each produce a
  specific, non-500 error.
- Share a document by email as Viewer or Editor, list everyone with access, and revoke it.
- Viewers get a read-only editor with the toolbar hidden and an explanatory banner — and
  the server rejects their writes with 403 independently of the UI.
- `npm test` passes: 21 tests, no database required, including one that drives the real
  PATCH route handler to prove a Viewer is rejected at the HTTP boundary.

### What is incomplete

- **No real-time collaboration.** Concurrent editors overwrite each other — last write
  wins. Cut deliberately; it would have consumed the whole timebox and still shipped
  half-finished. Reasoning in [ARCHITECTURE.md](ARCHITECTURE.md).
- **Auth is mocked.** No passwords or OAuth — anyone who knows a seeded email can sign in
  as that user. The brief permits this explicitly.
- **No document deletion.** Cut under the compressed timebox and not in the brief's
  requirements. `canManage` already supports it; it needs a route handler and a button.
- **No Markdown export.** Stretch-only by instruction, to be built after core work. Core
  work plus verification used the time.
- **Desktop-first.** Does not break on mobile, but was not optimised for it.
- **No pagination** on the dashboard. Fine at seeded scale, wrong at a thousand documents.

### What I would build next with 2–4 more hours

1. **Optimistic concurrency to replace last-write-wins** — send `updatedAt` with each
   PATCH, reject stale writes, and surface the conflict. The honest fix for the biggest
   correctness gap, at a fraction of the cost of real collaboration.
2. **Presence indicators via polling** — buys most of the perceived value of collaboration
   cheaply, and makes the overwrite risk visible instead of silent.
3. **Version history** — a revision row per settled save, with restore. Mitigates the same
   risk and is genuinely useful on its own.
4. **Share-by-link with expiry** — the most-requested sharing feature in real products,
   and it slots into `resolveAccess` as one more branch rather than a rewrite.
5. **PDF export** — higher demand than Markdown export, but needs a rendering dependency.

---

## Manifest

### Documentation

| File | Contents |
|------|----------|
| `README.md` | Setup, env vars, all `npm run` commands, seeded accounts, upload types and size cap, and the one-line note that auth is mocked. |
| `ARCHITECTURE.md` | Stack rationale, data model, the access-control chokepoint, parse-and-discard upload, the collaboration cut, and this status block. |
| `AI_WORKFLOW.md` | Tools used, where AI helped, **two concrete bugs in AI-written code that were found and fixed**, and how everything was verified. |
| `SUBMISSION.md` | This file. |
| `walkthrough-video.txt` | Unlisted video URL. |

### Source

| Path | Contents |
|------|----------|
| `lib/access.ts` | **The access chokepoint** — `resolveAccess`, `canEdit`, `canManage`. Start here. |
| `lib/sanitize.ts` | The XSS boundary: one allowlist shared by upload and PATCH. |
| `lib/parsers.ts` | `.docx` / `.md` / `.txt` → HTML. |
| `lib/session.ts` | Signed cookie session (mocked auth). |
| `lib/errors.ts`, `lib/client.ts` | Shared API error contract, server and client sides. |
| `app/api/**` | Route handlers: auth, documents, shares, upload. |
| `app/login`, `app/dashboard`, `app/doc/[id]` | The three screens, plus the editor's error boundary and 404. |
| `components/**` | Editor, Toolbar, ShareBar, UploadButton, DocumentList, SaveStatus, and headers. |
| `prisma/schema.prisma`, `prisma/seed.ts` | Data model and idempotent seed. |
| `tests/access.test.ts` | The required permission test, including the HTTP-boundary case. |
| `tests/sanitize.test.ts` | 12 XSS payloads, added after finding a real hole. |
| `samples/` | `.txt`, `.md`, and `.docx` files for testing upload. |

### Seeded credentials

No passwords — one-click sign-in on the login screen.

| Email | Name | Starting state |
|-------|------|----------------|
| `alice@ajaia.test` | Alice Reyes | Owns 2 documents; Bob's document is shared to her as **Viewer** |
| `bob@ajaia.test` | Bob Santos | Owns 1 document, shared to Alice |
| `carol@ajaia.test` | Carol Dimaano | No documents — use as a share target |

---

## Reviewing it in 60 seconds

1. Sign in as **Alice** → two distinct dashboard sections, one shared document already
   present.
2. Open **Q3 Product Review** → format text → stop typing → autosaves → reload → it
   persisted.
3. Open **Vendor contract review** → read-only, toolbar hidden, banner explains why.
4. **Share** Alice's document with `carol@ajaia.test` as **Editor** → **Switch user** →
   sign in as Carol → it appears under *Shared with me* with an Editor badge, editable.

To confirm the permission model is server-side rather than cosmetic, open the browser
console as Alice on Bob's document and run:

```js
fetch(location.pathname.replace('/doc/', '/api/documents/'), {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contentHtml: '<p>should not persist</p>' }),
}).then(r => r.status)
```

It returns **403**, and the document is unchanged.
