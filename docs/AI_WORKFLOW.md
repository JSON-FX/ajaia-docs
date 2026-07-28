# AI workflow

## Tools

- **Claude Code (Opus 5)** — the primary tool. Used for scaffolding, writing the route
  handlers and components, and driving a real browser to verify behaviour.
- **Claude in the browser** — used as a test harness, not just for screenshots: driving
  the running app, reading the network panel, and executing `fetch` calls against the live
  API to probe the permission model from a real session.

The build ran against a written spec, so AI was applied to *execution and verification*
rather than to deciding what to build.

---

## Where AI genuinely sped things up

**Boilerplate with a known shape.** Seven route handlers that all follow the same
sequence — resolve session, resolve access, branch on role, validate, write, return the
shared error envelope. The pattern was worth designing carefully once; typing it seven
times was not.

**Parallelising setup against a blocked dependency.** The Neon connection string was not
available at kickoff. Rather than idle, the work went to a local Docker Postgres, and the
schema and every DB-independent file were written while signup finished. Swapping to Neon
was then a one-line `DATABASE_URL` change with no code touched.

**Verification breadth.** The most valuable use by a distance. Hand-testing the permission
matrix across five actor types and three operations, plus five upload rejection paths and
twelve XSS payloads, would have taken longer than writing the features. Scripting those
probes against the running server took minutes, and it is what found both real bugs below.

---

## What was changed or rejected

### 1. A plausible-looking sanitiser config that silently disabled the allowlist

The first version of `lib/sanitize.ts` configured DOMPurify like this:

```ts
DOMPurify.sanitize(dirty, {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR: [...ALLOWED_ATTR],
  ALLOW_DATA_ATTR: false,
  USE_PROFILES: { html: true },   // ← wrong, and dangerous
});
```

That last line reads like a sensible hardening default. It is the opposite. DOMPurify
treats a profile as the **base** allowlist and merely *appends* `ALLOWED_TAGS` to it — so
the deliberately tight 16-tag list had been widened to the entire HTML profile. `div`,
`table`, `form`, `input`, and `img` all passed.

It was caught by uploading an `evil.md` containing `<script>` and
`<img src=x onerror="alert(1)">` and reading what actually landed in the database:

```
stored: <h1>Heading</h1>\n<img src="x"><p><a href="https://example.com">ok</a></p>
```

The `<script>` was gone and `onerror` was stripped, so a quick glance said "sanitiser
works". But `<img>` survived, and `img` is not in the allowlist — which meant the
allowlist was not the thing doing the work. Removing `USE_PROFILES` fixed it. The
resulting `tests/sanitize.test.ts` now runs 12 payloads (`script`, `iframe`, `svg`,
`form`, `onclick`, inline `style`, `javascript:` and `data:` URLs, plus the formatting
that must survive) so it cannot regress.

**The lesson worth generalising:** this is the failure mode that matters with generated
security code. It was not obviously broken — it was confidently plausible, and the
symptom looked like success. Reading the code back would not have caught it; asserting on
the stored output did.

### 2. Autosave firing on documents nobody edited

Opening a seeded document and typing nothing still showed "All changes saved". The network
panel showed a `PATCH → 200` at mount.

TipTap normalises the HTML it is handed — whitespace between block tags, attribute
ordering — and emits an `update` event for that normalisation. The autosave handler
treated it as a real edit. The effect was that merely *viewing* a document rewrote it and
bumped `updatedAt`, which silently reordered the dashboard, since it sorts by that column.

Fixed by capturing the post-normalisation HTML in `onCreate` as a baseline and only
reporting genuine divergence from it. Nothing about the original code looked wrong; it
was only visible in the network tab on a page where nothing had been typed.

### 3. A dependency that passed every local check and still broke production

The plan specified `isomorphic-dompurify` as the sanitizer. It worked in `next dev`, it
worked in a local production build under `next start`, and all 21 tests passed against it.
It failed on Vercel.

The symptom was an opaque 500 with an HTML error page — no message, no stack. What made it
diagnosable was that the failure was *selective*:

```
/api/documents          (no sanitize import)   200
/api/documents/[id]     (imports sanitize)     500
/[id]/shares            (access only)          200
/api/upload             (imports sanitize)     500
/doc/[id] page          (no sanitize import)   200
```

Every route importing `lib/sanitize.ts` failed and nothing else did, which places the
fault at module load rather than in any handler logic. The cause: `isomorphic-dompurify`
depends on jsdom, which resolves internals through dynamic requires that the bundler
cannot trace statically, so the serverless function shipped without them.

It never reproduced locally because a local production server can still fall back to
`node_modules` on disk — the packaging step that breaks it only happens on the platform.

Two fixes were tried and rejected because they did not work: `serverExternalPackages`
(opting the package out of bundling) and building with `--webpack` instead of Next 16's
default Turbopack. Rather than keep guessing at bundler configuration against a black box,
the dependency was replaced with `sanitize-html`, which is pure JavaScript with no DOM
emulation and therefore has nothing to fail to bundle. Before committing the swap, the
same 12 payloads were run through the new implementation and produced **byte-for-byte
identical output** to DOMPurify — so the security boundary was proven equivalent, not
assumed.

**Two lessons.** First, "works locally" is not a deployment signal for anything with
native or dynamic-require dependencies; the packaging step is the thing under test and it
only runs on the platform. Second, when a dependency fights the runtime, replacing it can
be cheaper and lower-risk than configuring around it — but only if you can prove the
replacement is equivalent, which is what the existing test suite made possible.

This is also the clearest argument for the deploy-early discipline: the app was fully
working locally and would have been submitted broken.

### 4. Stack defaults that needed overriding

- **Prisma installed as v7**, which removed `url` from the datasource block in favour of a
  `prisma.config.ts` plus a driver adapter. Correct for a greenfield serverless app with
  time to spare; wrong for a fixed timebox against a schema written for the classic
  pattern. Pinned to Prisma 6 and noted the reasoning rather than burning budget on a
  thinly-documented migration.
- **TipTap "just use the latest"** would have installed v3, whose `StarterKit` bundles
  `Underline` and whose peer-dependency tree differs. The spec pinned v2, so v2 it is,
  with `@tiptap/extension-underline` added explicitly.
- **The scaffold's `AGENTS.md`** stated that this Next.js version has breaking changes and
  that the bundled docs in `node_modules/next/dist/docs/` should be read first. Doing so
  confirmed that in Next 16 `params` is a `Promise` and `cookies()` is async, with
  synchronous access fully removed. Writing those handlers from memory would have produced
  code that fails to typecheck.
- **The scaffold's dark-mode CSS block was deleted.** Left in, a reviewer with OS dark mode
  enabled would have seen a dark page background behind a white document sheet with
  low-contrast chrome. Theming is out of scope; a single deliberate light theme is better
  than a broken automatic one.

---

### 5. Where the architecture paid for itself

Presence, comments, version history, and export were added late, after the core was
deployed and verified. All four needed permission checks, and **none of them needed any new
permission logic** — each route calls the same `resolveAccess` and the same
`canEdit`/`canManage` predicates.

That was the whole point of the chokepoint, and it is worth stating because it is testable
rather than aspirational. Verified against the running app: a non-member receives 404 on
every one of the four new endpoints, and a Viewer receives 403 on revision restore while
still being able to comment and export. Neither behaviour was written twice.

The one place the pattern needed thought was version history. The naive implementation —
snapshot on every PATCH — interacts badly with an 800 ms autosave: it produces a row every
few seconds of drafting and a history no human can read. Snapshots are therefore coalesced
inside a 45-second window, verified by firing five rapid saves and asserting the revision
count did not move.

## How correctness, UX, and reliability were verified

Nothing here was marked done because it looked right in the diff.

**Automated — 21 tests, no database required.**
The important one is not a unit test. `tests/access.test.ts` drives the **real** `PATCH`
route handler through the **real** `resolveAccess`, with only Prisma and the session
faked, and asserts that a Viewer gets 403 *and that the stored content is unchanged*.
A unit test of the resolver alone would still pass if a handler simply forgot to call it —
this is the test that catches that. It also covers the stale-share-row case, where a share
row naming the owner must not demote them.

**Manual, against the running app.** Signed in as each seeded user and exercised the whole
matrix through the live API from a real browser session:

| Actor | Read | Edit | Share |
|-------|------|------|-------|
| Owner | ✅ | ✅ 200 | ✅ |
| Editor | ✅ | ✅ 200 | ❌ 403 |
| Viewer | ✅ | ❌ 403 | ❌ 403 |
| Non-member | ❌ 404 | ❌ 404 | ❌ 404 |
| Signed out | ❌ 401 | ❌ 401 | ❌ 401 |

The Viewer 403 was confirmed *from Alice's own authenticated browser session* on Bob's
document, not from a synthetic request — proving the read-only mode is a server control
and not just a hidden toolbar. Unknown document IDs return 404 with the same body as a
no-access document, so existence is not leaked.

**Upload pipeline.** All three formats were pushed through the real HTTP endpoint with
generated fixtures, and the *stored* HTML was inspected rather than the response status.
Every rejection path was exercised: wrong extension, empty file, whitespace-only file,
a `.txt` renamed to `.docx`, and a 3 MB oversize file — each returning a specific message,
none returning a 500.

**Persistence.** Typed into a document, waited for the debounce, reloaded the page, and
confirmed the text survived — then confirmed the reload itself fired no write.

**Build health.** `npm test`, `tsc --noEmit`, and `next build` all pass clean.

---

## Honest assessment

AI made this roughly two to three times faster on the parts that were already decided:
scaffolding, repetitive handlers, and — most of all — the breadth of verification.

It was actively unhelpful in one specific way worth naming: it produced security code that
was **wrong but confident**. The `USE_PROFILES` line is exactly the sort of thing that
survives code review, because it reads as a hardening measure and the tests you would
naively write against it (does `<script>` get stripped? yes) still pass. The only thing
that caught it was asserting on what actually reached the database.

The parts that mattered most to the outcome were not generated: deciding that access
control gets exactly one chokepoint, that uploads are parsed and discarded, that
real-time collaboration was the right thing to cut, and that a Viewer's read-only mode
must be a server rule rather than a UI state. AI executed those decisions quickly and
well. It did not make them, and on the sanitiser it would have shipped a quiet hole in
the one boundary that most needed to hold.
