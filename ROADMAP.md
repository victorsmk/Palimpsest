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

## Bring your own text: upload a PDF, TXT or DOCX (raised 2026-10-25; built 2026-10-27: TXT, DOCX and pasted text)

**Done, for plain text (.txt), Word (.docx) and pasted text; PDF is not.** The user's words: "txt files should be enough
(maybe also docx if not too complicated)", and to do it the best way I could, unattended. What was built, in
`lib/userTexts/` and the `/texts` page ("Your texts" in every page's navigation):

- **Kept in this browser only** (`localStorage`, key `palimpsest:user-texts:v1`); nothing is uploaded, said on the page
  and in the privacy policy. Limits: 600,000 characters a text, 2,000,000 in all, 30 texts; a refused write says so
  and nothing is lost. Data it cannot read is never written over.
- **Reading files** (`files.ts`, no new dependency): `.txt` as UTF-8, else Windows-1252; a binary file is refused;
  `.docx` read by unpacking the zip with the browser's own `DecompressionStream` and reading `word/document.xml`
  (a zip bomb is refused at 30 MB unpacked; files over 5 MB are refused). A document of short paragraphs with empty
  ones between is taken for verse. PDF and other types are refused with a message saying what to do (copy the text and
  paste it, or save as .txt/.docx).
- **Editing:** a form to paste or choose a file, set title and author, choose prose or poetry (guessed from the
  text), correct the text in a box with a live count of words and excerpts; later Edit and Delete (with a question).
- **Cutting** (`cut.ts`): the library's rules without the Gutenberg parts: excerpts of about 450 words that end at
  a paragraph (or stanza), a very long paragraph cut at sentence ends, verse keeping its lines.
- **Excerpt ids follow what an excerpt says** (a hash of its text), not where it is: editing a text changes only the
  ids of the excerpts that changed, so poems made from the other parts keep opening. A poem made from a part that was
  changed shows "can no longer be shown" in My Collection.
- **In the pages:** a text's excerpts open in Discover, Assisted and the Studio like any book (`#passage=my-…`), with
  the Previous/Next/Change bar; the book picker lists "Your own texts" first; the Studio's footer says "Your own text".
- **Limits worth knowing:** a poem saved from such a text is stored (on the server with an account) as the numbers of
  the words kept, so it opens again only in the browser that has the text. An uploaded text is not checked for rights;
  the page says to add only what you may use.
- **Not done:** PDF (extracting clean text needs a library and a decision; asked for later), `.doc`/`.rtf`/`.odt`,
  keeping texts in the account so they follow the writer to other browsers.

## Many more books, chosen from a list (raised 2026-10-25; in progress since 2026-10-28, see LIBRARY.md)

**Steps 1 to 3 are built (2026-10-28). Step 4 (the full list of about 200 books) was set aside on 2026-10-27 at the user's word: ten books are enough as an example, and they have no time to save 200 files by hand. Steps 4a (verse support) is built; 4b and 4c stay as written in LIBRARY.md if it is ever wanted.** **Also decided 2026-10-28 (user):** once the picker exists, the three bundled excerpts (Jane Eyre, Walden, Dorian Gray) must not appear as examples any more. They stay in the app only so that poems already made from them keep opening.

**Decided 2026-10-28:** about 200 well-known public-domain books (published 1930 or earlier) from Project Gutenberg, kept in the database as excerpts of about 450 words, browsed and searched by title and author; "surprise me" later. Step 1 (tables, cutting rules, import command) is built; steps 2 to 4 are not. The original notes follow.

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

## Rethink "Back up all poems" and "Restore from a backup" (raised 2026-10-27; done 2026-10-28)

**Done.** Decided with the user: with an account, the JSON buttons are not shown at all, and **Download my poems as
text** gives a plain text file (`lib/export/collectionText.ts`). In the browser-only version the text download is
there too, and the machine-readable copy stays under plainer names ("Download a copy of all my poems", "Add poems
from a downloaded copy…"). The restore code is untouched, since bringing browser poems into an account uses it.
A Word-style document remains an idea for later. What was weighed:

The user finds the JSON backup file unnecessary and unintuitive: fewer than 5% of people know what a JSON file
is. Things that were to be settled:

- With poems kept in an account, the account is the backup, so the two buttons could simply go for signed-in
  people. For the browser-only version they are the only way to move poems to another browser or to keep a copy
  if the browser's storage is cleared, so removing them there removes a safety net.
- If a file stays, it could be named for what it does ("Download a copy of all my poems", "Add poems from a
  downloaded copy") and the file could be something a person can read (a text or document file with the poems
  in it) as well as, or instead of, the machine-readable one. Markdown export was removed earlier for lack of a
  use; a readable copy is a different use.
- The restore machinery must stay: "add the poems kept in this browser to my account" is built on it.
- Whatever changes, the tests of backup and restore (unit and browser) would change with it.

## Look and feel: specific changes the user asked for (raised 2026-10-28)

**Started 2026-10-27 (the home page only):** the user chose the "antique library" direction: a darkened engraving of
a library as the hero, a gilt Playfair Display title, an erasure animation on a real Walden sentence, cards that lift,
sections that slide up on scroll (CSS only, off with reduced motion), public-domain engravings from Wikimedia Commons
with credits in the footer (`public/images/`). Items 1 and 2 below are done on the home page. **Inside pages, done 2026-10-27:** a shared dark header (`SiteHeader`) on Discover, Assisted, the Studio, the start
screen and `/texts`; gilt-ruled cards and dialogs; a ruled frame on the book page; ink bars that sweep across a word
when it is erased and draw back when it is restored; a page that rises into view when a passage is chosen; gilt marks
on found poems; library-card rows in the picker and My Collection. Everything still is Chromium-checked only, and all
motion is off under reduced motion.

To do together with the "Look and feel" pass above, or earlier if they are quick:

1. **A bigger title.** The PALIMPSEST name at the top is too small.
2. **My Collection and Account at the right of the page, in the top corner**, rather than among the other
   navigation buttons (Discover, Assisted, the Studio).
3. **Done 2026-10-27: removed the offer to add poems saved in this browser to an account** (the "bring across" dialog and the
   Account dialog's button for it). The user sees no point to it. I read this as the bring-across step; this
   needs confirming before it is done. If it goes, `lib/account/bringAcross.ts`, `BringAcrossDialog` and their
   tests go too, but the restore code stays only if something else uses it (the browser-only version's
   "Add poems from a downloaded copy…" does).

## Other things done 2026-10-27, from the old list

- **Surprise me:** `GET /api/library/random` (never cached) and a button in the book picker; no SQL needed.
- **A size cap per account:** it already existed (2,000 poems a collection, limits on each poem: `lib/models/limits.ts`).
- **Left as decided:** the Assisted search stays on the page's thread (no worker); more books are not being added.
