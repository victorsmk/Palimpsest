# The library of books

Palimpsest is growing from three bundled excerpts to a library of books from Project Gutenberg, chosen from a
list and searched by title or author. This file is how books get in. The plan is in four steps:

1. **Data and import (done, this file).** Two tables, the cutting rules, and the command that imports books.
2. **Endpoints and library plumbing (done 2026-10-28).** The site can now read the database's books; no screen shows
   them yet (that is step 3). Public, read-only endpoints, no sign-in, nothing else changed:
   - `GET /api/library/books?search=&after=&limit=` lists books by title (ignoring a leading The, A, An); a search
     wants every word somewhere in "title author", ignoring capitals and accents ("bronte" finds Brontë).
   - `GET /api/library/books/<id>` and `GET /api/library/books/<id>/passages?after=&limit=` give a book and its
     excerpts, in order, without their text.
   - `GET /api/library/passages/<id>` gives one excerpt with its text. The browser makes its words from the text
     with the same tokenizer as before, so saved poems point at the same word ids.
   - Caching: an excerpt's text is kept "for good" (`immutable`, a year at Vercel's servers) because it never
     changes; lists are kept for minutes. The firewall rule in DEPLOYMENT.md part 6 covers floods, since there is
     no user to count requests against.
   - A poem made from a library excerpt is listed in My Collection with its first words and opens in the Studio.
     The app reaches any excerpt by its id, whether or not it is listed (`PassageLibrary` is "open-ended" when
     there is a server library). My Collection fetches the excerpts of the poems on a page one at a time (cached),
     and a batch endpoint is the thing to add if that is ever slow.
   - `/api/health` has a `library` line (the tables exist).
3. **Search and browse screens** (not started).
4. **The full list of about 200 books** (not started): drafted by Claude, reviewed by you, imported with the
   same command.

Until step 2, nothing on the site uses these tables. Importing books changes nothing you can see.

## What the import does

- It reads text files **you** have saved. **It downloads nothing.** Project Gutenberg says its site is for
  human visitors and that automated downloading outside its listed methods can get an IP address blocked, so
  the files are saved by hand (ten for the pilot is a few minutes).
- For each book in a list it checks that the file really is that book (title and author), removes Gutenberg's
  header and licence text, finds the chapters (or, with none found, cuts the text in runs), and cuts it into
  **excerpts of about 450 words that end at a paragraph**. An excerpt is the unit you make a poem from.
- It adds the book and its excerpts to the database, all or none. **A book that is already there is left
  exactly as it is.**
- It only accepts books first published in **1930 or earlier**, which are public domain in the USA in 2026.

**Excerpts are never changed or re-cut after import.** A saved poem points at the words of an excerpt by their
position, so changing an excerpt would break every poem made from it. If a book must be redone, delete its row
in the `books` table (its excerpts go with it) **before anyone has made poems from it**, and import it again.

## The pilot: ten books

The list is [`data/library/pilot.json`](data/library/pilot.json). Please check the years in it too: the catalogue
has no publication dates, so they are from Claude's knowledge.

| Number | Book | Page |
|---|---|---|
| 1342 | Pride and Prejudice, Jane Austen (1813) | https://www.gutenberg.org/ebooks/1342 |
| 84 | Frankenstein, Mary Shelley (1818) | https://www.gutenberg.org/ebooks/84 |
| 2701 | Moby Dick, Herman Melville (1851) | https://www.gutenberg.org/ebooks/2701 |
| 11 | Alice's Adventures in Wonderland, Lewis Carroll (1865) | https://www.gutenberg.org/ebooks/11 |
| 345 | Dracula, Bram Stoker (1897) | https://www.gutenberg.org/ebooks/345 |
| 98 | A Tale of Two Cities, Charles Dickens (1859) | https://www.gutenberg.org/ebooks/98 |
| 1661 | The Adventures of Sherlock Holmes, Arthur Conan Doyle (1892) | https://www.gutenberg.org/ebooks/1661 |
| 76 | Adventures of Huckleberry Finn, Mark Twain (1884) | https://www.gutenberg.org/ebooks/76 |
| 1400 | Great Expectations, Charles Dickens (1861) | https://www.gutenberg.org/ebooks/1400 |
| 205 | Walden, Henry David Thoreau (1854) | https://www.gutenberg.org/ebooks/205 |

### 1. Save the files

For each book: open its page, choose the **Plain Text UTF-8** format, and save the file as **`pg` + the number +
`.txt`** (for example `pg1342.txt`) in the folder **`data/library/raw/`** (make it if it is not there; Git
ignores it, because the files are large). The plain-text link on a book's page normally looks like
`https://www.gutenberg.org/cache/epub/1342/pg1342.txt`, which saves under that very name.

### 2. A dry run

```bash
npm run import:library -- --list data/library/pilot.json --dry-run
```

It reads the files and prints, for each book, how many excerpts and words it found, and at the end the total
size of the text. It writes nothing anywhere. A line starting `PROBLEM:` says which book could not be used and
why (a missing file, a file that is not the listed book, a missing start or end line). **Send me the whole
output** (it contains no passwords or keys), and I will check that it looks right before anything goes into
the database.

### 3. Make the tables

In Supabase, **SQL Editor**: run [`db/schema.sql`](db/schema.sql) and then [`db/supabase.sql`](db/supabase.sql)
again (both are safe to run again). This adds the `books` and `passages` tables, with row level security on
and no rules, like the others.

### 4. The real run

The command needs the same `DATABASE_URL` as the site (the pooled connection string, with `?sslmode=require`).
Put it in `.env.local` in the project folder (that file is never committed or sent anywhere), then:

```bash
npm run import:library -- --list data/library/pilot.json
```

It says, for each book, `added` or `already in the library, left as it is`, and ends with how much room the
library takes in the database. **Send me that line**: with it I can work out whether 200 books will fit in
the 500 MB of the free plan with the poems.

In the Supabase **Table Editor**, `books` should list the books and `passages` should hold several thousand
rows.

## What was tested, and what was not

Tested: the cutting rules on synthetic books and on three real Gutenberg files (Jane Eyre, The Picture of
Dorian Gray, Walden): that the book is found inside Gutenberg's text, that no word is lost, the size of every
excerpt, chapters, headings in their usual forms, contents lists and credits left out; the check that a file is
the listed book; storing on a real Postgres engine (all or none, nothing changed for a book already there,
cascade on delete); the command run as a plain Node program, its exit codes, and its refusal of books too new
for the public domain.

Not tested: a run against your real Supabase (needs your database); books other than those three (Moby Dick,
Dracula and the rest may have headings the rules do not recognise, which the dry run's excerpt counts will
show); the real size of the tables with TOAST compression (the pilot measures it).

**Known limits of the rules (version 1).**
- Chapters are found by headings such as `CHAPTER IV`, `Book Two`, `Part 1`, `Letter 3`, or a number with a title
  (`I. A SCANDAL IN BOHEMIA`). A bare number on its own line counts as a chapter only if nothing better is found.
- A contents list (four or more headings in a row) is left out, with the front matter after it, so a book with
  chapters starts at its first chapter. A book with **no** headings found (Walden's are in capitals only) is cut in
  numbered parts from its very first line, so its first excerpt holds the title page and contents.
- A chapter heading with a short title under it takes the title into the name; a stage direction in brackets does not.
- Verse and plays lose their line breaks (a paragraph becomes one line), so the library suits prose.
- A short chapter stays as an excerpt of its own, so a few excerpts are under 200 words (Moby Dick's shortest has 44).

**The pilot books after the dry run (2026-10-28):** all ten match their files. Looking at what the rules made of
them found four faults, which are fixed: the contents lists of Moby Dick and Huckleberry Finn took the front
matter into their first excerpt; Sherlock Holmes' twelve stories were not recognised; chapters under 150 words
were being dropped; and a title came out as "Harker'S". The cutting rules (still version 1, since nothing had
been imported) now give: Pride and Prejudice 61 chapters, Frankenstein 28, Moby Dick 135, Alice 12, Dracula 27,
A Tale of Two Cities 45, Sherlock Holmes 12, Huckleberry Finn 43, Great Expectations 59, Walden none found;
2,532 excerpts in all and 6.6 MB of text. Each begins at its first chapter, except Walden.
