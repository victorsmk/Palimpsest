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
