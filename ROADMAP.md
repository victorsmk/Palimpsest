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
