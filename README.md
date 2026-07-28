# Ajaia Docs

A lightweight collaborative document editor — create, format, upload, and share documents
with per-user Viewer/Editor permissions.

> **Live demo:** **https://ajaia-docs-assessment-jayson-alanano.vercel.app**
>
> **Sign in as `alice@ajaia.test`.** One click, no password. Alice already owns two
> documents and has a third shared with her by Bob as a **Viewer**, so the sharing and
> read-only features are visible immediately without any setup.

---

## Seeded accounts

Authentication is **mocked** for this assignment — there are no passwords. The login
screen verifies that the email belongs to a seeded user and issues a signed, httpOnly
session cookie. It is not real auth and is not pretending to be.

| Email | Name | Starting state |
|-------|------|----------------|
| `alice@ajaia.test` | Alice Reyes | Owns 2 documents; has Bob's document shared to her as **Viewer** |
| `bob@ajaia.test` | Bob Santos | Owns 1 document, shared to Alice as Viewer |
| `carol@ajaia.test` | Carol Dimaano | No documents — useful as a share target |

The login page has one-click buttons for all three. That is a deliberate reviewer-UX
choice: testing the sharing flow means switching identity repeatedly, and a password form
would add friction to every switch for no benefit.

### The 60-second review path

1. Sign in as **Alice** → dashboard shows **My documents** (2) and **Shared with me** (1).
2. Open **Q3 Product Review** → format text, stop typing, watch it autosave.
3. Reload the page → your edit is still there.
4. Back to the dashboard → open **Vendor contract review** (the shared one) → it is
   read-only, with the toolbar hidden and a banner explaining why.
5. Open Alice's document → **Share** → add `carol@ajaia.test` as **Editor**.
6. **Switch user** → sign in as Carol → the document now appears under *Shared with me*
   with an **Editor** badge, and she can edit it.

---

## Features

- **Rich-text editing** — bold, italic, underline, H1, H2, paragraph, bulleted and
  numbered lists, with active-state highlighting on the toolbar.
- **Debounced autosave** (800 ms) with a visible status: `Saving… / All changes saved /
  Save failed — Retry`. A manual **Save** button is there too.
- **Rename** — edit the title inline; it saves on blur.
- **Upload `.txt`, `.md`, `.docx`** → becomes a new editable document. Limits are stated
  in the UI, not just here.
- **Sharing** — grant another user Viewer or Editor access by email, see who has access,
  and revoke it.
- **Read-only mode** for Viewers — enforced on the server, not just hidden in the UI.
- **Presence indicators** — see who else has the document open, on an 8-second heartbeat.
  This is presence, not collaborative editing: saves are still last-write-wins, and the
  indicator exists to make that visible rather than to hide it.
- **Comments** — document-level, with resolve/reopen and delete. **Viewers can comment**
  without gaining write access, which is the point of read-only sharing.
- **Version history** — one snapshot per editing session (not per keystroke), with preview
  and restore. Restoring saves the current version first, so a restore is undoable.
- **Export** — download as Markdown, or Print / Save as PDF using your browser's print
  dialog and a dedicated print stylesheet.

### Upload limits

| | |
|---|---|
| Accepted types | `.txt`, `.md`, `.docx` |
| Maximum file size | 2 MB |
| Maximum stored content | 1 MB of HTML |

Sample files to try are in [`samples/`](samples/).

Uploaded files are parsed into HTML on the server and **the original bytes are
discarded** — nothing is written to disk or object storage. See
[ARCHITECTURE.md](docs/ARCHITECTURE.md) for why.

---

## Running locally

### Prerequisites

- Node.js 20.9+ (built and tested on Node 26)
- A PostgreSQL database — [Neon](https://neon.tech)'s free tier is what this was built
  against, but any Postgres works.

### Setup

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string. On serverless, prefer Neon's **pooled** endpoint (the host containing `-pooler`). |
| `SESSION_SECRET` | Signs the session cookie. Generate with `openssl rand -hex 32`. |

Create the schema and seed the three demo users and documents:

```bash
npm run db:push
```

```bash
npm run db:seed
```

Start the dev server:

```bash
npm run dev
```

Then open http://localhost:3000.

### Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the Vitest suite (37 tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:seed` | Seed users and demo content (upsert-only — idempotent and safe against production, but it never deletes) |
| `npm run db:reset` | **Destructive.** Delete everything that isn't seeded, then re-seed. Use this to clear uploads, ad-hoc shares, and comments after trying the app |

### Tests

```bash
npm test
```

37 tests across three files, and they need **no database** — the access tests inject a fake
Prisma client.

- `tests/access.test.ts` — the permission model. Covers owner/editor/viewer/non-member
  resolution, the stale-share-row case, and `canEdit`/`canManage`. Crucially it also
  drives the real `PATCH /api/documents/:id` handler to assert a Viewer is rejected with
  **403 at the HTTP boundary** — a unit test of the resolver alone would still pass if a
  route forgot to call it.
- `tests/sanitize.test.ts` — the XSS boundary, with 12 payloads. Added after a real bug;
  see [AI_WORKFLOW.md](docs/AI_WORKFLOW.md).
- `tests/markdown.test.ts` — the hand-rolled HTML→Markdown export converter. It is
  hand-rolled specifically to avoid a DOM dependency on the server, so its correctness
  rests on these tests rather than on a library's reputation.

---

## Deployment

Deployed on Vercel. To deploy your own copy:

1. Push this repository to GitHub.
2. Import it in Vercel.
3. Set `DATABASE_URL` and `SESSION_SECRET` as environment variables.
4. Deploy, then seed the production database once with `npm run db:seed` pointed at the
   production `DATABASE_URL`.

`prisma generate` runs automatically via the `postinstall` script, which Vercel's build
requires.

---

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack rationale, data model, the access-control
  chokepoint, the parse-and-discard upload decision, and what was deliberately cut.
- [AI_WORKFLOW.md](docs/AI_WORKFLOW.md) — how AI was used, what was rejected, and how the work
  was verified.
- [SUBMISSION.md](docs/SUBMISSION.md) — deliverables manifest and project status.
