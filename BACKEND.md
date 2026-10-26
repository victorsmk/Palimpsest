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

- All storage is behind `PoemRepository` (`create`, `update`, `importMany`, `get`, `list`, `delete`, all async).
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
| 1 | Poem ids and timestamps are made by the browser (`poem-<time>-<random>`, the user's clock) | **Done** (3a, 3b): every poem has a UUID id, old ones included, and the repository assigns the id and both times |
| 2 | No revision, owner or deleted marker on a poem; two tabs saving can overwrite each other | **Done** (3a, 3b): a `revision` is counted on every save and a save from an out-of-date revision is refused. Owner and deleted marker are for the server |
| 3 | Poems are tied to word ids made from the bundled text (`walden-woods-token-0014`); a changed text orphans them | **Done** (3a): each poem records the version of its passage text; one made from changed text is refused with a clear message |
| 4 | Validation lived in the browser-only folder and the backup code reached into it | **Done**: `lib/models/poemValidation.ts` |
| 5 | No single place chose the implementation; the poem service silently defaulted to the browser one | **Done**: `lib/services/container.ts`, setting `NEXT_PUBLIC_DATA_BACKEND` |
| 6 | Limits were uneven (titles capped only on rename and copy) | **Done**: `lib/models/limits.ts`, one set, enforced when writing |
| 7 | Listing returns everything; passages come with their whole text | **Done** (step 5): library lists and poem lists are paged summaries; a passage and a poem are fetched whole only when wanted |
| 8 | Errors are generic ("browser storage full") | **Done** (step 4): every repository failure is a typed `RepositoryError`, and `describeError` is the one place that decides what the writer is told |
| 9 | Named collections are defined as types only | **Open**: build once, before or with the backend |
| 10 | No sign-in, no "not signed in" or offline state | **Open** (the backend work itself) |
| 11 | Tests only covered the browser implementation | **Done**: one contract suite, run against every repository |
| 12 | Other browser tabs are not noticed | **Mostly done** (3b): a tab that saves from an old revision is refused with a message. A tab is still not told the moment another one changes something |

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
- **A contract test suite** (`tests/contract/poemRepositoryContract.ts`, 42 rules) run against
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
   - **3b, done:** the repository owns identity. `create(draft)` returns the stored poem with the id,
     both times and revision 1 that the repository assigned; `update(id, draft, expectedRevision)`
     returns the next revision, or is refused with a `PoemConflictError` (carrying the poem as stored) if
     the stored revision is not the one the save started from, or a `PoemGoneError` if the poem was
     deleted (it is never re-created). A draft has no id, times or revision, so a caller cannot choose
     them. `saveMany` became `importMany`, used only to restore backups: it keeps ids, times and
     revisions, and refuses an id that is already stored. The Studio remembers the revision it opened or
     last saved and says so on every save; renaming from My Collection says the revision its list showed.
     The messages are plain text in the save form and in the collection panel. A server repository
     keeps the same rules (the contract suite checks them), with `If-Match` carrying the revision.
4. ~~**Typed repository errors.**~~ **Done.** `RepositoryError` (in `lib/models/errors.ts`) has a `code` and a
   `retryable` flag: `limit`, `conflict`, `gone`, `storage` (full, blocked or other: the browser repository tells
   them apart from the error the browser threw), and, defined for the backend but unreachable in the browser
   version, `offline`, `unauthorized`, `rate-limited` and `unavailable`. `lib/errors/describe.ts` is the one place
   that turns an error into the words a screen shows ("Please try again." only where trying again could help;
   anything unknown gets a plain sentence about what was being done). The contract suite requires a failed write to
   be a `StorageError`, so a server repository has to map its own failures too. Not yet done: the screens do not
   have a "sign in" or "offline" state to show; that comes with the backend.
5. **Paging and on-demand passages.**
   - **5a, done:** `BookRepository` lists *summaries* (`PassageSummary`: no text, no words) a page at a time
     (`listBooks`, `listPassageSummaries`, optionally for one book; `{after, limit}` in, `{items, next}` out; limit
     100 by default, 500 at most; a cursor that names nothing ends the walk). `getPassage(id)` gives one passage
     whole. `listPassages(bookId)`, which handed over every text, is gone. `BookService.openLibrary()` returns one
     `PassageLibrary` shared by every screen: all summaries up front, each passage fetched once when asked for
     (`ensure`), concurrent asks share one fetch, a failed fetch is not remembered. The Studio loads only its
     starting passage (the first, the one a `#found=`/`#assisted=`/`#poem=`/`#open=` link names) and loads another
     when it is chosen; Discover and Assisted load the passage they show (`usePassageChoice`); My Collection
     loads just the passages its poems were made from, before showing the list. A passage that cannot be loaded
     says so ("That passage could not be opened. Please try again.") and the screen keeps what it had. A
     `BookRepository` contract suite (paging rules included) is run against the browser implementation.
   - **5b, done:** the same for poems. `PoemRepository` gained `listSummaries(page)` (a `PoemSummary`: id,
     passage, revision, title, style, word count, times, and a *preview head*: the ids of the first three lines'
     words, each cut to the 31 words that could be shown in 60 characters, so a server can make it without
     knowing the passage), `list(page)` (whole poems, for a backup), `count()` and `getMany(ids)`; `list()`
     returning everything is gone. Order is the most recently changed first, then by id; the cursor is a
     *position* (`updatedAt|id`), not an item, so a page continues correctly even if the poem it came from was
     deleted or changed, and nothing is lost or repeated by changes between pages. The service takes the
     collection size from `count()` (the 2,000-poem limit), plans a restore from `getMany` of the ids in the
     backup, and walks `list` pages for a backup. My Collection shows 100 at a time with a "Show more poems"
     button, keeps as many as were showing after a rename, copy, delete or restore, and fetches the whole poem
     when one is chosen (a poem deleted elsewhere is reported, and the list made again). The poem contract suite
     grew to 58 rules, run against all three implementations.
   - **Not done, and not needed yet:** a book picker (the selector buttons list every summary; fine for a
     handful of books, not for hundreds) and search over a long text on the server or in a worker (a ROADMAP
     item; the search still runs in the page, on the one passage on screen).
6. **The real backend** (decisions made 2026-10-27: Vercel for hosting, Supabase for Postgres and sign-in, our own
   API routes, email one-time code and later Google, account deletion included; the user creates the accounts and
   keeps the keys in environment settings).
   - **6a, done:** `db/schema.sql` (one `poems` table, one row per poem per user, primary key `(user_id, id)`,
     the words as `jsonb`, the list's summary data kept beside them, the times as the poem wrote them plus a
     number to order by, an index in list order) and `db/supabase.sql` (the Supabase-only extras: delete a user's
     poems with their account, and row level security on with no policies so the public keys can reach nothing).
     `lib/server/PostgresPoemRepository.ts` implements `PoemRepository` for one user over a two-method `Db`
     (`lib/server/db.ts`); `lib/server/pgDb.ts` is that `Db` over the `pg` driver. Every statement carries the
     user's id. It applies the 2,000-poem limit itself, in the write's own transaction under a per-user advisory
     lock. A database failure is an `UnavailableError`. The poem contract suite (58 rules) passes against it on
     real SQL, run in an in-process Postgres (PGlite) with the real schema, plus its own tests (users cannot reach
     each other's poems, the limit, exact round trips, atomic imports, failures). **Not verified:** the `pg`
     adapter against a real Postgres (there is none here; its transaction handling is tested against a stand-in
     driver only), the advisory lock under real concurrency (PGlite has one connection, so the race test cannot
     tell it from nothing), and the `supabase.sql` statements on Supabase.
   - **6b, done:** the poems API. Framework-free handlers in `lib/server/api/` (`handlers.ts`: plain functions from a
     `Request` to a `Response`), thin route files under `app/api/`, wired to the environment in `server.ts`.
     Endpoints, all JSON, all `Authorization: Bearer <token>`, never cached:

     | Method and path | Does | Success |
     |---|---|---|
     | `GET /api/poems?after=&limit=&full=1` | a page of summaries (whole poems with `full=1`), newest change first | 200 `{items, next}` |
     | `POST /api/poems` | saves a new poem | 201 the poem |
     | `GET /api/poems/:id` | one poem | 200 |
     | `PUT /api/poems/:id` + `If-Match: <revision>` | saves over a poem | 200 the poem |
     | `DELETE /api/poems/:id` | deletes (idempotent) | 204 |
     | `GET /api/collection/count` | how many | 200 `{count}` |
     | `POST /api/collection/lookup {ids}` | those poems, whole | 200 `{poems}` |
     | `POST /api/collection/import {poems}` | adds poems with their own ids/times/revisions, all or none | 201 `{added}` |

     Errors are `{error: {code, message, current?}}`: 400 `invalid` (malformed), 401 `unauthorized` (with
     `WWW-Authenticate: Bearer`), 404 `gone`, 409 `conflict` (with `current`, the poem as stored) or `exists`,
     413/415/428 `invalid`, 422 `limit` (a message to show), 503 `unavailable`, 500 anything else. The cause of a
     failure is logged on the server and never sent. Who is asking is settled first, before the body is read:
     `supabaseAuthenticator` asks Supabase's `/auth/v1/user` with the token (no extra package); a failure of
     Supabase is "unavailable", never "signed out". The browser is not trusted: `validate.ts` checks every
     field (ids, lengths, the limits, no control characters, line breaks only after kept words), cuts and
     repairs nothing, and the server assigns id, times and revision whatever the request says. Settings
     (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `PALIMPSEST_TEST_AUTH`) are in `.env.example`;
     a missing or wrong one makes every request answer 503, and the test sign-in is refused in production.
     **Tested:** 91 tests of the handlers on real SQL (PGlite), plus the real Next server over HTTP in
     development and production mode (routes, 401/400/415/428 answers, the production refusal of the test
     sign-in, and a database that is not there giving 503 through the real `pg` driver). **Not verified:** the
     Supabase answer to `/auth/v1/user` (tested against a stand-in for what its documentation says), a real
     database, and no rate limiting yet (the `429` is defined but nothing sends it; Vercel and Supabase have
     their own limits).
   - **6c:** `HttpPoemRepository` and the `server` backend kind, run through the contract suite against the routes.
   - **6d:** sign-in dialog (email code), signed-out behaviour, bringing local poems across, account deletion,
     the wording changes. Google sign-in is in ROADMAP.md.
   - **6e:** deployment guide and a manual checklist for the real Supabase and Vercel setup.
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
