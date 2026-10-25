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

## Move the Assisted search to a Web Worker, if it proves necessary (decided 2026-10-25)

The Assisted search runs on the page's own thread. Measured in Chromium on the production build: the
page is blocked for about 0.1–0.26 s at normal speed, and 0.45–1.4 s with the CPU slowed 4x (Walden is
the slowest). Not worth a worker yet, by decision. Revisit if it feels laggy on real phones. The search
does not touch the UI and has a `shouldCancel` hook, so the move is wiring, not a rewrite. A cheaper
first step would be to make the search itself faster (fewer lines kept per word, a smaller span).
