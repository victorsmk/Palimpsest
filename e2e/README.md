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
