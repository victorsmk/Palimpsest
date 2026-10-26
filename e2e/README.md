# End-to-end tests

Playwright specs that drive the real app in Chromium, Firefox and WebKit. They build the
app and start it on port 3100 (`playwright.config.ts`), so nothing else needs to be running.

```bash
npm run test:e2e                          # all three browsers
npx playwright test --project=firefox     # one browser
npx playwright test e2e/layout.spec.ts    # one file
```

First time on a machine, download the browsers (about 1.2 GB on disk in total):

```bash
npx playwright install chromium firefox webkit
```

WebKit here is Playwright's own build of the engine. It is a close proxy for Safari's
rendering, not Safari itself.

## Firefox fails with "spawn UNKNOWN" on Windows

Symptom: every Firefox test fails in a few milliseconds with `browserType.launch: spawn UNKNOWN`,
and running `firefox.exe` directly reports "the side-by-side configuration is incorrect"
(`mozglue` could not be found).

On the machine where this was first seen, the very same Firefox files run from some folders
(`C:\Users\<you>\...`, `C:\...`, `Documents`, `AppData\Local\Temp`) but not from
`AppData\Local` or `AppData\Roaming`, which is where Playwright installs them. The files are
identical either way (same hashes); only the location matters. The cause is not known; it is
specific to that Windows setup.

Workaround: copy the installed Firefox folder somewhere that works and point the Firefox
project at it. Put this in `.env.e2e.local` in the project root (git ignores it):

```
PW_FIREFOX_EXECUTABLE=C:\Users\<you>\pw-firefox\firefox-1555\firefox\firefox.exe
```

`playwright.config.ts` reads that file and passes the path to the Firefox project. Without
the variable, Playwright uses its normal install location, which is correct on machines
where Firefox starts there.

## What the specs cover

- `studio.spec.ts`: create, save, reload and reopen a poem; updating and deleting drafts;
  refusing stale, orphaned or unreadable drafts; storage failures; PNG export of the page
  (all three erasure styles) and of the poem; the `/prototype` redirect.
- `keyboard.spec.ts`: Tab, arrow keys and Space on the passage; focus trapping, Escape and
  focus return in both dialogs.
- `layout.spec.ts`: no word ever moves when words are erased or the erasure style changes.
- `pagedna.spec.ts`: the Page DNA headline and strip in the Studio sidebar: poems to find per
  passage, blocks drawn at the right place and never over each other, number only as a hover detail.
- `handoff.spec.ts`: a poem sent from Discover in the URL hash (`/studio#found=...`) opens with exactly
  its words and line breaks; the link is removed from the address bar; bad or stale links are refused.
  The same for a poem of scattered words sent from the Assisted page (`/studio#assisted=...`).
- `discover.spec.ts`: the Discover page: every poem found in each passage against the golden fixture,
  expandable variants, "Open in editor" landing in the Studio, the clickable strip, and a phone-sized screen.
- `navigation.spec.ts`: page titles, the skip link, the links between Home, the Studio and Discover, the
  passage kept in Discover's address, keyboard order, spoken announcements, strip-number contrast and
  24px touch targets. In WebKit (like Safari) Tab skips links, so those checks adapt per browser.
- `export.spec.ts`: the text download (name, lines as broken, source, no notes), the disabled state with nothing kept, Print / Save as PDF (the dialog is called; in print
  media only the poem is visible; Chromium renders a one-page PDF), and the notice timer.
- `poem-v2.spec.ts`: poems saved by the first version of the app (listed, opened, saved into the new form with
  new ids, renamed, copied, restored from an old backup without adding twice), a new poem's id, revision
  and passage version, and a poem made from a book whose text has changed being refused.
- `collection-pages.spec.ts`: My Collection on the home, Discover and Assisted pages (the same panel),
  opening a saved poem in the Studio by `#open=<id>` (as the same poem, with its notes), refused links,
  the unsaved-changes question, managing and backing up from those pages, keyboard and phone.
- `share.spec.ts`: "Copy link to this poem" (the exact link: words, breaks, style, title, never notes), opening
  it for someone else, the hand copy fallback, a title shown as plain text, links that will not open, the
  unsaved-changes question, keyboard and phone. The clipboard is stubbed so every browser runs the same checks.
- `backup.spec.ts`: backing up the collection to a dated file and restoring it (a real download, then the
  file chosen again after the browser forgets everything), the question before restoring, only ever adding,
  keeping your own version of a changed poem, files that are not backups, hostile entries, a full browser,
  keyboard and phone.
- `storage-errors.spec.ts`: what is said when the browser's storage is full, blocked, or fails for another reason (saving
  keeps the form open and the words; renaming keeps what was typed; duplicating). The same error is also checked where each
  action is tested.
- `collection-paging.spec.ts`: a collection of more poems than fit on a page (100 at a time, "Show more poems", cards with their
  book and first lines on every page, a poem from a later page opens whole with its notes, a change keeps what was shown,
  a poem deleted elsewhere is reported when chosen).
- `conflicts.spec.ts`: two tabs of one browser on one collection. A save from an out-of-date revision is refused with the
  conflict message and changes nothing (the other tab's version stays, the words stay on the page); opening the poem again
  and saving works; a poem deleted in the other tab is reported, not brought back, and saving again makes a new poem;
  renaming from a list that is out of date is refused; renaming the open poem does not cause a conflict, and a rename
  that follows another tab's change does not hide it from the next save.
- `collection-actions.spec.ts`: renaming (field, Enter/Escape/Cancel, limit, failure, moves to the top, the
  poem open in the Studio follows) and duplicating a poem ("(copy)", announced, independent, one copy per
  double click), on a phone and from the keyboard.
- `unsaved.spec.ts`: the Studio asks before unsaved changes are thrown away (switching passage, opening a
  draft, a link to a poem, leaving by a link), not when nothing is unsaved (saved, undone, freshly opened),
  the question's keyboard and phone layout, and the browser's own warning when the tab is closed.
- `collection.spec.ts`: a poem in My Collection (its book, its first three lines, "…" when there is more,
  poems with the same title told apart) and deleting one: the in-app question, Cancel focused, Escape,
  focus restored, keyboard only, phone layout, and a failed deletion.
- `uncertain.spec.ts`: poems that depend on how a word is said: Discover keeps them behind a collapsed
  button (Jane Eyre has 7, the other passages none), the Assisted page looks for them only when asked;
  notes on each uncertain word, the underline, Studio hand-off, keyboard, touch size, no sideways scroll.
- `assist.spec.ts`: the Assisted page (`/assist`): the poems of each passage (count and best poem pinned),
  the marked source stretch, "Show more", the passage in the address, opening a poem in the Studio with
  exactly its words, links to and from the other pages, title, skip link, keyboard, headings, 24px targets,
  contrast of the struck-through words and no sideways scroll on a phone.

## The server backend (`e2e-server/`)

The app with its poems on the server and the made-up sign-in is tested separately, by `playwright.server.config.ts`
(`npm run test:e2e:server`, Chromium only), against a development server started with
`NEXT_PUBLIC_DATA_BACKEND=server` and `NEXT_PUBLIC_TEST_AUTH=1` (the made-up sign-in is refused in a production
build, which is what the main suite tests). `/api` is answered inside the test process by the real API handlers
over a real SQL database (PGlite), a fresh one for every test; a test can make the server answer with a status or
vanish (`server.answerWith`, `server.offline`). `account.spec.ts`: signing in with a code (every error), saving
needing an account, My Collection signed out and in, each account's own poems, a link to a saved poem, backup
and restore, a server that is down or a sign-in that has run out, two tabs, bringing the poems of the browser
across (offered, added, "not now", twice, a failure), and deleting the account.
