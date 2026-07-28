# Working notes

Running log. Raw material for `AI_WORKFLOW.md`. Not submitted.

## Timebox

Portal timer read `217:23` at kickoff → ~3h37m, not 6h. Running the **§10A compressed
plan**: share bar instead of a modal, no `DELETE /api/documents/:id`, `access.test.ts`
only (skipping `parsers.test.ts`).

## Log

- **Setup** — Node 26 / Next 16.2.12 scaffolded via `create-next-app`. Spec was written
  against an older Next; App Router route handlers in 15+ take `params` as a `Promise`,
  so every dynamic route awaits it. Noting because it's the kind of thing a stale AI
  training set gets wrong — first draft of a route handler destructured `params`
  synchronously and would have failed the type check.
- **DB** — started on local Docker Postgres to avoid blocking on Neon signup, then swapped
  `DATABASE_URL` to Neon once the connection string arrived. Prisma made this a one-line
  change with no code touched, which is the argument for the ORM in the first place.
- **Security** — Neon connection string was pasted into chat. It lives only in `.env`
  (covered by `.gitignore`'s `.env*`). Flagged to rotate after submission.
- **TipTap pinned to v2** (`@tiptap/*@^2`) per spec. Worth noting: v3's `StarterKit`
  bundles `Underline`, v2's does not — hence the separate `@tiptap/extension-underline`
  dependency. An AI suggestion to "just use the latest TipTap" would have silently
  changed the extension set and pulled in a different peer-dep tree.

## Bugs found, and how

Both of these were found by *checking*, not by reading the code back — worth recording
because the code looked correct in review both times.

1. **Spurious PATCH on every document open.** Opened a seeded doc, typed nothing, and the
   save indicator already read "All changes saved". The network tab showed a
   `PATCH → 200` fired at mount. Cause: TipTap normalises the HTML it is handed
   (whitespace between block tags) and emits an `update` for that normalisation, which
   the autosave handler forwarded like a real edit. Effect: merely *viewing* a document
   rewrote it and bumped `updatedAt`, silently reordering the dashboard, which sorts by
   it. Fix: capture the post-normalisation HTML in `onCreate` as a baseline and only
   report genuine divergence (`components/Editor.tsx`).

2. **The sanitiser allowlist was not actually tight.** Uploaded an `evil.md` containing
   `<script>` and `<img src=x onerror=...>`. The script tag and the `onerror` attribute
   were both stripped, so at a glance it passed — but `<img src="x">` survived, and `img`
   is not in the allowlist. Cause: `USE_PROFILES: { html: true }` was passed alongside
   `ALLOWED_TAGS`; DOMPurify treats a profile as the *base* allowlist and merely appends
   `ALLOWED_TAGS` to it, so the tight 16-tag list had been silently widened to the entire
   HTML profile (`div`, `table`, `form`, `input`, … all passing). This is the kind of
   plausible-looking config line that reads as a safe default and is the opposite.
   Fix: dropped `USE_PROFILES`; added `tests/sanitize.test.ts` with 12 payloads so it
   cannot regress.

3. **The sanitizer broke only in production.** Deployed to Vercel, then probed the live
   API — `PATCH` and `POST /api/upload` returned 500 while every route that doesn't import
   `lib/sanitize.ts` returned fine. That selectivity is what identified it as a module-load
   failure rather than handler logic. `isomorphic-dompurify` → jsdom → dynamic requires the
   bundler can't trace into a serverless function. Tried `serverExternalPackages`, then a
   `--webpack` build; neither worked. Replaced with `sanitize-html` (pure JS, no DOM
   emulation) after confirming byte-identical output on all 12 XSS payloads. Never
   reproduced locally — `next start` still resolves from node_modules on disk.
   **This is the case for deploying early: the app was 100% working locally and would have
   shipped broken.**

## Tests

Kept `access.test.ts` (required) and added `sanitize.test.ts` off the back of bug #2 —
that one guards a boundary that had actually broken, which is worth more than the
`parsers.test.ts` the compressed plan cut. 21 tests total.

## Late scope extension (deliberate, at the user's call)

With ~85 min of build time left after deployment was verified, added presence indicators,
comments, version history, and Markdown/PDF export. I flagged the risk first — the docs
argued these were deliberate cuts, so building them meant rewriting the status blocks and
the collaboration section or the submission would contradict itself. Went ahead, and the
docs were rewritten to scope the headline cut precisely: presence exists, shared editing
state does not.

Design calls made to keep these shippable rather than half-built:

- **Comments are document-level, not range-anchored.** Inline anchors need a TipTap mark
  plus reconciliation as surrounding text changes; drifting anchors are worse than no
  anchors.
- **Revision snapshots are coalesced in a 45s window.** Snapshot-per-PATCH would write a
  row every few seconds against an 800ms autosave. Verified: 5 rapid saves → still 1
  revision.
- **PDF is print-to-PDF, not headless Chromium.** After the jsdom failure, deliberately
  refused to put another large binary with dynamic requires into a lambda.
- **The Markdown converter is hand-rolled**, because `turndown` needs a DOM — the same trap
  as bug #3. Tractable only because stored HTML has already passed the 16-tag allowlist.

The chokepoint held: all four features reused `resolveAccess` with zero new permission
logic. Non-members get 404 on all four new endpoints; viewers get 403 on restore but can
still comment and export.

## Deferred (nice-to-haves that were NOT built, on purpose)

- Real-time collaboration (see ARCHITECTURE.md — the headline cut)
- Comments / suggestion mode
- Version history
- Markdown export (§10 stretch — only if time remains after Phase 7)

## Tradeoffs & cuts

- (appended as they happen)
