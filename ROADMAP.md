# Palimpsest — notes for later

Things we agreed to come back to. Not scheduled; none of them is being worked on yet.

## Look and feel (raised 2026-10-25)

The site is plain on purpose while the features are being made to work. Once they do, it needs
personality: images, animation, a better colour palette, and more playful fonts and details.
Do this as its own pass, not mixed into feature work.

## A real backend (raised 2026-10-25)

Today everything is local to the browser (drafts live in `localStorage` behind the repository
layer). At some point there need to be real users with real data stored in a database: accounts,
drafts and poems saved per user, and anything shared between people.

The repository layer (`BrowserBookRepository`, `BrowserPoemRepository`) is the seam for this: a
server-backed repository can replace the browser one without the UI changing. Decisions still to
make: which database and host, how users sign in, how existing local drafts move across, and what
is private versus shareable.

**Decided 2026-10-26:** server-first (signed-in users work against the server, not a synced local copy),
and free hosting and database tiers first. The full review, what has been done, the plan and the free
options are in [BACKEND.md](BACKEND.md).

## Move the Assisted search to a Web Worker, if it proves necessary (decided 2026-10-25)

The Assisted search runs on the page's own thread. Measured in Chromium on the production build: the
page is blocked for about 0.1–0.26 s at normal speed, and 0.45–1.4 s with the CPU slowed 4x (Walden is
the slowest). Not worth a worker yet, by decision. Revisit if it feels laggy on real phones. The search
does not touch the UI and has a `shouldCancel` hook, so the move is wiring, not a rewrite. A cheaper
first step would be to make the search itself faster (fewer lines kept per word, a smaller span).

## Bring your own text: upload a PDF, TXT or DOCX (raised 2026-10-25)

A user should be able to upload a text in PDF, plain-text or Word (.docx) format and use it in the
Studio, Discover and Assisted pages like any bundled passage. Things to settle when we get there:
extracting clean text from each format (PDFs especially), how a long upload is split into passages
(the searches are built for a few hundred words at a time), where the upload lives (this browser only,
or the backend once there is one), and rights: the bundled books are public domain, an upload may not
be, so exported poems and attribution need care. The spec lists user uploads as out of scope for the
MVP, so this is a later phase.

## Many more books, chosen from a list (raised 2026-10-25)

Three passages shown as buttons at the top is fine as a proof of concept. With many books it needs a
different structure: a browsable, searchable list (by title, author, maybe genre or length), probably
with a way to pick a chapter or passage inside a book. The source could be a database of many Project
Gutenberg books. Things to settle: how passages are cut from a whole book, whether texts are fetched
on demand instead of bundled with the app (the three passages are bundled today, and the syllable
dictionary is already 1.5 MB), verifying each text's source and licence as the spec requires, and the
cost of running the searches on longer or more passages. This goes naturally with the backend item.

## Google sign-in, as well as the email code (raised 2026-10-27; built 2026-10-27, see BACKEND.md and DEPLOYMENT.md part 2b; the real Google flow is still to be tried)

The first sign-in will be an email one-time code (BACKEND.md, step 6). The user would like Google sign-in
as well, once the basics work: it also avoids the small free-tier email limit. Things to settle: setting up
the Google OAuth client (the user's account), the redirect flow (it leaves the page, so unsaved work in the
Studio must be kept across it), and linking a Google sign-in to an existing email account.
