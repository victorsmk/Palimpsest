# Backend readiness review

Written 2026-10-26. A review of how ready the architecture is for a real backend (spec §14, Phase 5:
"review architecture for future backend migration"), what has been done about it, and what is left.

## Decisions so far

- **Server-first.** Signed-in users work against the server, not a local copy that syncs later. The
  app is not meant to run only on one machine. (Decided 2026-10-26.) Using Discover, Assisted and the
  Studio's editing does not need an account; *saving* poems will.
- **Free to run.** Look for free hosting and database tiers first (options below).
- Everything stays small and stepwise; each step is proposed, approved, tested and reviewed.

## Verdict

The **data-access seam was mostly ready**; the **edges were not**: how poems are identified, versioned,
kept safe from overwriting, limited and configured. Steps 1 and 2 below are done. The rest needs the
poem model to change (step 3), which is where the real backend work starts.

## What was already in good shape (verified in the code)

- All storage is behind `PoemRepository` (`save`, `saveMany`, `get`, `list`, `delete`, all async).
  Exactly one file touches `localStorage`: `BrowserPoemRepository`.
- Screens never import repositories. They use services (`poemService`, `bookService`).
- Every service call is already asynchronous, and the screens already have loading and error states for
  listing, saving, renaming, duplicating, deleting, backing up and restoring.
- Stored poems are validated strictly (`parsePoem`), with a schema version; a poem from a newer schema
  is refused, and unreadable stored entries are kept, not destroyed.
- The backup file is a ready-made migration path: validated, restore only adds, safe to repeat, written
  in one go. `#poem=` share links are self-contained and keep working with any backend.
- The search and syllable code does not touch the screen, so it could run on a server or in a worker.

## Gaps, and where each stands

| # | Gap | Status |
|---|---|---|
| 1 | Poem ids and timestamps are made by the browser (`poem-<time>-<random>`, the user's clock) | **Part done** (3a): every poem now has a UUID id, old ones included. The store assigning ids and times is 3b |
| 2 | No revision, owner or deleted marker on a poem; two tabs saving can overwrite each other | **Part done** (3a): a `revision` is counted on every save. Refusing a stale save is 3b. Owner and deleted marker are for the server |
| 3 | Poems are tied to word ids made from the bundled text (`walden-woods-token-0014`); a changed text orphans them | **Done** (3a): each poem records the version of its passage text; one made from changed text is refused with a clear message |
| 4 | Validation lived in the browser-only folder and the backup code reached into it | **Done**: `lib/models/poemValidation.ts` |
| 5 | No single place chose the implementation; the poem service silently defaulted to the browser one | **Done**: `lib/services/container.ts`, setting `NEXT_PUBLIC_DATA_BACKEND` |
| 6 | Limits were uneven (titles capped only on rename and copy) | **Done**: `lib/models/limits.ts`, one set, enforced when writing |
| 7 | Listing returns everything; passages come with their whole text | **Open** (step 5, with many books) |
| 8 | Errors are generic ("browser storage full") | **Started**: `PoemLimitError`; typed errors still open (step 4) |
| 9 | Named collections are defined as types only | **Open**: build once, before or with the backend |
| 10 | No sign-in, no "not signed in" or offline state | **Open** (the backend work itself) |
| 11 | Tests only covered the browser implementation | **Done**: one contract suite, run against every repository |
| 12 | Other browser tabs are not noticed | **Open** (a server removes most of this) |

### What steps 1 and 2 changed

- **Shared models.** `parsePoem` (reading) and `poemLimitProblem` (writing) live in `lib/models`, with
  no browser dependency, so a server can use the very same code.
- **One set of limits** (`LIMITS`): title 120 characters (a longer one is cut), notes 10,000 characters
  (longer is refused, never silently cut), 10,000 kept words, 2,000 poems per collection, 5 MB backup
  files. They are enforced when something is *written*; reading stays lenient, so a poem saved before a
  limit existed never becomes unreadable. A refusal is a `PoemLimitError` with a plain message that the
  screens show; the save form stops typing at the limits.
- **A composition root.** `lib/services/container.ts` is the one place that decides where data lives.
  `PoemService` and `BookService` no longer default to anything: they are given a repository. An unknown
  setting stops the app at start-up with a plain message.
- **A contract test suite** (`tests/contract/poemRepositoryContract.ts`, 26 rules) run against
  `MemoryPoemRepository`, `BrowserPoemRepository` on in-memory storage, and `BrowserPoemRepository` on
  the real `localStorage`. Any new repository must pass the same rules: copies not shared objects,
  saving many is all-or-nothing, a failed write leaves the data as it was, `__proto__` is refused,
  and so on.

## Plan, in order

1. ~~Shared validation, one set of limits, a contract test suite.~~ **Done.**
2. ~~One place that chooses the implementation.~~ **Done.**
3. **Poem model version 2**, in two parts.
   - **3a, done:** schema version 2 with a `revision` (counted on every save) and a `passageVersion`
     (a fingerprint of the passage text and the tokenizer's version); opening a poem whose text has
     changed is refused. Every poem, old ones included, has the same kind of id (a UUID). A poem made by
     version 1 is read as version 2 under an id worked out from its old one (`legacyPoemId`, UUID v5),
     so reading needs no migration step, the first write stores the whole collection in the new form,
     and an old backup restores without adding twice. Backups are now version 2 and version 1 files
     are still read.
   - **3b, next:** the repository owns identity: `save` returns the stored poem with the id, times and
     revision it assigned; an update states the revision it started from and a stale one is refused
     with a conflict (so two tabs cannot overwrite each other, and a server can do the same);
     `saveMany` becomes `importMany`, used only to restore backups.
4. **Typed repository errors:** not found, conflict, not signed in, offline, rate-limited, limit; and
   the matching screen messages.
5. **Paging and on-demand passages** (when there are many books): summary lists, passages fetched when
   opened, search on the server or in a worker for long texts.
6. **The real backend:** an HTTP poem repository, the API behind it, sign-in, and the "save needs an
   account" flow.
7. **Named collections**, on the same repository pattern (`CollectionRepository` already exists as a type).

## What "server-first" means for the design

- **Anonymous use stays.** Reading, Discover, Assisted and editing in the Studio need no account. Saving,
  My Collection, and anything stored need one. Signed out, "Save Draft" asks you to sign in.
- **Bringing existing local poems across.** After the first sign-in, offer to add the poems in this
  browser to the account, using the existing backup and restore (it only ever adds, and it is safe to
  repeat). The `#open=<id>` link uses the poem's id, so links made before the move stop working.
- **Saving** is a request, so it can fail or be slow: the screens must keep what the writer typed and
  say what happened. (They already do for local failures.)
- **Conflicts.** The server sends a `revision` with each poem; a save says which revision it started
  from (`If-Match`); if it is out of date the writer is told the poem changed elsewhere, and chooses.
- **Authority.** The server re-applies every limit and the validation. Nothing the browser says is trusted.
- **Wording to change at that point.** The save form says "Drafts are stored locally in your browser
  storage"; Back up / Restore stay useful as an export.

## Free options (searched 2026-10-26; verify the pricing pages before relying on any number)

| Need | Candidate | Free tier, as reported | Catches |
|---|---|---|---|
| Database + sign-in in one | **Supabase** | Postgres, 500 MB per project, sign-in included, up to 50,000 monthly users, 2 free projects | A free project is **paused after 7 days without activity** and needs reactivating by hand |
| Database only | **Neon** | Postgres, 0.5 GB per project, scales to zero | Sign-in is a separate matter (a newer built-in option exists, unconfirmed) |
| Hosting the Next.js app | **Vercel Hobby** | Free; roughly 100 GB bandwidth and 1M function calls a month; pauses rather than bills at the limit | **Non-commercial use only**; one seat |

A reasonable free stack for a school project: **Vercel (hosting) + Supabase (Postgres and sign-in)**.
The pause-after-inactivity catch of Supabase's free tier matters for a demo: it would need waking before
a presentation. Sources: [Supabase pricing guide](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/),
[database free tier comparison](https://agentdeals.dev/database-free-tier-comparison-2026),
[Neon vs Supabase](https://agentdeals.dev/neon-vs-supabase),
[Vercel free tier limits](https://deploywise.dev/blog/vercel-free-tier-limits-2026).

## Open decisions

- Stack: Vercel + Supabase, or something else free. Whether the Next.js app hosts the API (route
  handlers) or a separate service does.
- Sign-in method (email link, a school or Google account, anonymous accounts).
- Poem model version 2 details: id format (server-assigned UUID), revision semantics, when the local
  migration runs.
- Public versus private: shared links currently carry the title; a "published poem" page is a separate
  idea.
- Whether signed-out visitors can keep a temporary local draft before signing in.

## Configuration

`NEXT_PUBLIC_DATA_BACKEND` chooses where data lives. Unset means `browser`, the only backend built so
far. Any other value stops the app at start-up with a message. A server backend would be a new entry in
`lib/services/container.ts` with a repository behind it.
