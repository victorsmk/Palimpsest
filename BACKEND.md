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
- **A contract test suite** (`tests/contract/poemRepositoryContract.ts`, 58 rules now) run against
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
     (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, optional `PALIMPSEST_TEST_AUTH`; the older `SUPABASE_ANON_KEY` is accepted too) are in `.env.example`;
     a missing or wrong one makes every request answer 503, and the test sign-in is refused in production.
     **Tested:** 91 tests of the handlers on real SQL (PGlite), plus the real Next server over HTTP in
     development and production mode (routes, 401/400/415/428 answers, the production refusal of the test
     sign-in, and a database that is not there giving 503 through the real `pg` driver). **Not verified:** the
     Supabase answer to `/auth/v1/user` (tested against a stand-in for what its documentation says), a real
     database, and no rate limiting yet (the `429` is defined but nothing sends it; Vercel and Supabase have
     their own limits).
   - **6c, done:** `HttpPoemRepository` (`lib/repositories/http/`), the browser's `PoemRepository` over the API, and
     the `server` backend kind (`NEXT_PUBLIC_DATA_BACKEND=server`; books stay bundled). Who is signed in comes
     from `lib/auth/session.ts` (a token source that the sign-in of 6d fills in); with nobody signed in
     nothing is sent and the writer gets `UnauthorizedError`. It sends only a draft's content, the token as a
     bearer, and the revision as `If-Match`; it believes no answer it has not checked (a poem is read as
     strictly as one from storage, a summary by `parsePoemSummary`, pages and counts by shape) and turns each
     failure into a typed error: 401 unauthorized, 404 gone (a read of a missing poem is `null`), 409
     conflict (with the stored poem) or exists, 422 limit (the server's own words), 429 rate limited, no answer
     offline or unavailable, 5xx and anything that is not the API's own answer unavailable, and 400/413/415/428
     (the app's own mistakes) a plain error. The poem contract suite passes through the whole road (this
     repository, the real handlers, the Postgres repository, real SQL): five implementations now, 58 rules each.
     Two things the road taught: the API gives a clear refusal for notes over the limit, so the contract's
     "long notes" fixture is now near the limit (10,019 characters before), and a `limit` of zero or less is
     passed on to be raised to the smallest page. Next's dynamic `:id` arrives decoded (checked on the real
     server). **Not verified:** a real network, real CORS-free same-origin deployment, and the browser with the
     `server` kind (no sign-in exists yet, so every screen would say "You need to sign in"; that is 6d).
   - **6d, done:** sign-in, the signed-out behaviour, bringing local poems across, account deletion, the
     wording. Details:
     - *Sign-in layer* (`lib/auth/`): an `AuthClient` (send a code, sign in with it, session, sign out) with a
       Supabase implementation (`signInWithOtp` / `verifyOtp` of type `email`, session kept and renewed by
       supabase-js, loaded only when used) and a made-up one for development and tests (any address, the
       code 123456, the token the server's test sign-in accepts; refused in a production build). An
       `AuthManager` holds the state (loading, signed out, signed in), waits for the service before it
       hands out a token, checks addresses and codes before the service is asked, and maps errors to four
       plain ones (bad address, wrong or expired code, too many tries, unavailable). A page sets
       `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public by design; `..._ANON_KEY` works too).
     - *Screens:* "Sign in" / "Account" next to My Collection on every page (nothing is shown when poems are
       kept in the browser). The sign-in dialog is a code, not a link, so the page, and a poem in the Studio,
       are never left. A visitor who presses Save is asked to sign in first and the save form opens after;
       My Collection says "Sign in to see your collection" instead of showing an empty list, and a list that
       cannot be read says so; a `#open=` link says "Sign in to open your saved poems."; the save form says
       "Drafts are saved to your account." Account dialog: who is signed in, sign out, delete the account.
     - *Bringing poems across:* on a sign-in, if this browser holds poems and the person has not answered
       before, one dialog offers to add them (it is a restore: it only adds, repeats add nothing, the copies
       here are never touched; closing it counts as "not now" and it is not asked again; the account dialog
       keeps the offer). Many poems go in several requests (about 3 MB or 400 poems each); a failure leaves the
       earlier requests' poems added, and doing it again finishes the job.
     - *Account deletion:* `DELETE /api/account` removes the user's poems first, then the Supabase user with
       the secret key (`SUPABASE_SECRET_KEY`, or the older `SUPABASE_SERVICE_ROLE_KEY`; server only; sent in the `apikey` header only, as Supabase says for its new secret keys, and also as a bearer for a legacy JWT key). If the key is missing,
       or the user cannot be removed, nothing is deleted at all in the first case, and in the second the poems
       are already gone and trying again finishes it. A user Supabase no longer has counts as deleted.
     **Tested:** 56 unit tests of the sign-in layer (with a stand-in for Supabase's client), the account
     deletion in the API tests, and `e2e-server/` (26 browser tests, `npm run test:e2e:server`) in which the
     real browser, screens and API handlers run over a real SQL database in the test process with the
     made-up sign-in. **Not verified:** the real Supabase email code (it needs the email template changed to
     show the code: see 6e), Supabase's real error replies (mapped from its documented ones), the
     deletion call to Supabase's admin API, and anything over a real network.
   - **Local demo, done** (after 6e): `npm run dev:demo` / `dev-demo.bat` (port 3200) runs the server backend with
     the real route files, API and SQL against PGlite (Postgres inside the server process, in memory, from
     `db/schema.sql`) and the made-up sign-in (`PALIMPSEST_DEMO=1`, which implies the test sign-in; refused in
     production by the configuration). PGlite is loaded only then, kept out of the server bundle
     (`serverExternalPackages`), and the sign-in dialog says what to type. Tested: the real script started and
     asked over HTTP, and `e2e-demo/` (`npm run test:e2e:demo`, 5 browser tests with nothing standing in for
     the server: saving, a fresh browser seeing the same poem, separate accounts, a conflict, deleting an account).
   - **Library tables and import, done** (step 1 of the book library, 2026-10-28; see LIBRARY.md): `books` and
     `passages` (source text only; the words are made by the tokenizer, as for the bundled excerpts), the cutting
     rules in `scripts/library/cut.mjs` (frozen per CUTTER_VERSION; excerpts are never re-cut), and
     `npm run import:library` reading Gutenberg files saved by hand (no automated download, by Gutenberg's
     policy). Nothing on the site reads them yet.
   - **Book picker, done** (step 3 of the book library, 2026-10-28): `BookBrowser` (search + a book's excerpts, in
     the page or in a window), `PassageSwitcher` (current excerpt, Previous/Next from the server's `position`, Change),
     `ChooseBookScreen` (what Discover, Assisted and the Studio show before a choice; option B, chosen by the user
     over opening a starting excerpt), `usePagedList` (pages, a pause before searching, only the newest answer shown).
     Only when there is a server library; the browser-only version is unchanged.
   - **Library endpoints, done** (step 2 of the book library, 2026-10-28; see LIBRARY.md): public read-only
     `/api/library/...` (books with accent- and case-insensitive search, a book's excerpts, one excerpt), cached
     at Vercel (an excerpt `immutable`), `HttpBookRepository` and an open-ended `PassageLibrary` in the browser,
     a `library` line on the health page, and three real books seeded into the local demo. No screen uses it yet.
   - **Rate limiting, done** (decided 2026-10-28): per signed-in user, counted in Postgres (`rate_limits`: one row per
     kind of request and user, a fixed window; one statement so concurrent requests are all counted; Vercel's
     functions share no memory, so counting in memory would not work). 300 reads and 60 writes a minute, 5
     account deletions an hour; 429 with `Retry-After` (the time left in the window). Fails open: if the counter
     cannot be written the request goes through and the log says so; `/api/health` reports a missing table.
     The user is counted after sign-in is checked, so unsigned floods are for Vercel's firewall rule
     (DEPLOYMENT.md part 6). Not covered: account-creation floods, total storage per account.
   - **Google-only mode, done** (decided 2026-10-27, because a free custom SMTP sender was not available):
     `NEXT_PUBLIC_EMAIL_SIGN_IN=off` makes the sign-in dialog show Google's button alone (no email form, no "or";
     Google's failure message loses "or use your email"; with no Google client id it says sign-in is not
     available). It only hides the form: Supabase's email sign-in itself is not switched off.
   - **Google sign-in, done** (decided 2026-10-27): "Continue with Google" above the email form, when
     `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set. Google's own button (its script is loaded only when the dialog
     opens; `lib/auth/googleIdentity.ts`) opens Google's popup and calls back with a signed token; the app
     gives it to Supabase's `signInWithIdToken` with a one-time nonce (Google gets the SHA-256, Supabase the raw
     value). The page never leaves, so an unsaved poem stays. The server is unchanged: it asks Supabase who a
     token belongs to, whichever way it was got, and account deletion is the same. The same address by email
     code and by Google is one account (Supabase links verified emails, per its documentation). The made-up sign-in
     of the demo and the tests has a stand-in button, "Continue with Google (demo)", signing in as
     google-demo@example.com. Tested: 29 unit tests (script loader, nonce, the call to Supabase and every error,
     the stand-in, the manager, the dialog), 4 tests in `e2e-server/` and 1 in `e2e-demo/`. **Not verified:**
     the real Google popup, Google's token, Supabase checking it, and the linking. DEPLOYMENT.md part 2b has the
     Google Cloud and Supabase steps, and checklist lines for each of those.
   - **6e, done:** [DEPLOYMENT.md](DEPLOYMENT.md): the steps for Supabase (database, the two SQL files, the email
     templates that must show the code, the keys) and Vercel (settings, region), a health page to check the result,
     a checklist to run once on the live site, and troubleshooting. `GET /api/health` (no sign-in needed) says by
     name which setting is missing, whether the database answers and has the table, whether Supabase answers, and
     whether account deletion is set up, without ever showing a value. The connection to Supabase's pooler now
     encrypts without checking its certificate unless `DATABASE_CA_CERT` is given (Supabase signs with its own
     authority); `DATABASE_POOL_MAX` sets the pool (default 3). What Supabase's documentation says, read on
     2026-10-27, is in the guide: its built-in email service sends only to members of the project's
     organization, about 2 an hour, so other people signing in needs custom SMTP.
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

## Decisions

Made (2026-10-27): Vercel for hosting and Supabase for Postgres and sign-in; our own API routes (not the browser
talking to Supabase); sign-in by an email one-time code, Google later (ROADMAP.md); account deletion included;
the user creates the Supabase and Vercel accounts and keeps the keys in environment settings.

Still open:

- Public versus private: shared links currently carry the title; a "published poem" page is a separate idea.
- Whether signed-out visitors can keep a temporary local draft before signing in (today the poem stays on the
  page, and saving asks to sign in).
- Rate limiting in the API (the error exists; nothing sends it).
- A book picker and server-side search, when there are many books.

## Configuration

`NEXT_PUBLIC_DATA_BACKEND` chooses where poems live: unset or `browser` is this browser's storage (no accounts,
nothing to sign in to), `server` is the API and an account. Any other value stops the app at start-up with a
message. It is read when the app is built. All the settings, with what each is for, are in `.env.example`.
