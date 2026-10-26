import { readFileSync } from 'node:fs';
import type { Db } from '@/lib/server/db';
import type { Passage } from '@/lib/models';
import { cutBook } from '../../scripts/library/cut.mjs';
import { saveBook } from '../../scripts/library/store.mjs';

/** Real books from the repository, cut and stored the way the import command does it. */
export const REAL_BOOKS = {
  janeEyre: { file: 'jane-eyre-raw.txt', entry: { gutenbergId: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë', year: 1847 } },
  dorianGray: { file: 'dorian-gray-raw.txt', entry: { gutenbergId: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', year: 1890 } },
  walden: { file: 'walden-raw.txt', entry: { gutenbergId: 205, title: 'Walden', author: 'Henry David Thoreau', year: 1854 } },
} as const;

const cuts = new Map<string, ReturnType<typeof cutBook>>();

/** The excerpts of a real book (cut once per test run: it takes a moment). */
export function excerptsOf(book: keyof typeof REAL_BOOKS) {
  const { file, entry } = REAL_BOOKS[book];
  let excerpts = cuts.get(file);
  if (!excerpts) {
    excerpts = cutBook(readFileSync(`data/texts/${file}`, 'utf-8'), entry);
    cuts.set(file, excerpts);
  }
  return excerpts;
}

export async function seedRealBooks(db: Db, ...books: (keyof typeof REAL_BOOKS)[]) {
  for (const book of books) await saveBook(db, REAL_BOOKS[book].entry, excerptsOf(book));
}

/**
 * Stores passages that a test made up (a book for each bookId, named from the first passage's attribution)
 * so that a repository over the library can be tried on exactly these, in this order.
 */
export async function seedPassages(db: Db, passages: Passage[]) {
  const books = new Map<string, Passage[]>();
  for (const passage of passages) books.set(passage.bookId, [...(books.get(passage.bookId) ?? []), passage]);
  let number = 1;
  for (const [bookId, own] of books) {
    const { title, author, year } = own[0].attribution;
    await db.query(
      `insert into books (id, gutenberg_id, title, author, year, language, source, url, license_note, passage_count, word_count, cutter_version)
       values ($1, $2, $3, $4, $5, 'en', 'Project Gutenberg', 'https://www.gutenberg.org/ebooks/1', 'Public domain in the USA', $6, $7, 1)`,
      [bookId, number++, title, author, year, own.length, own.length]
    );
    for (const [index, passage] of own.entries()) {
      await db.query(
        `insert into passages (id, book_id, ordinal, title, description, source_text, word_count) values ($1, $2, $3, $4, $5, $6, 1)`,
        [passage.id, bookId, index + 1, passage.title, passage.description, passage.sourceText]
      );
    }
  }
}

/**
 * A small book of verse in the shape Project Gutenberg gives one: a title in capitals, stanzas with their lines
 * indented, blank lines between. The words are Poe's (public domain), a few stanzas each, enough to be cut.
 */
export const VERSE_FILE = `Title: Poems of Poe

Author: Poe, Edgar Allan

*** START OF THE PROJECT GUTENBERG EBOOK POEMS OF POE ***

THE RAVEN

   Once upon a midnight dreary, while I pondered, weak and weary,
   Over many a quaint and curious volume of forgotten lore—
   While I nodded, nearly napping, suddenly there came a tapping,
   As of some one gently rapping, rapping at my chamber door.
   "'Tis some visitor," I muttered, "tapping at my chamber door—
               Only this and nothing more."

   Ah, distinctly I remember it was in the bleak December,
   And each separate dying ember wrought its ghost upon the floor.
   Eagerly I wished the morrow;—vainly I had sought to borrow
   From my books surcease of sorrow—sorrow for the lost Lenore—
   For the rare and radiant maiden whom the angels name Lenore—
               Nameless here for evermore.

ANNABEL LEE

   It was many and many a year ago,
      In a kingdom by the sea,
   That a maiden there lived whom you may know
      By the name of ANNABEL LEE;
   And this maiden she lived with no other thought
      Than to love and be loved by me.

ELDORADO

   Gaily bedight,
   A gallant knight,
   In sunshine and in shadow,
   Had journeyed long,
   Singing a song,
   In search of Eldorado.

THE BELLS

   Hear the sledges with the bells—
      Silver bells!
   What a world of merriment their melody foretells!
      How they tinkle, tinkle, tinkle,
   In the icy air of night!

*** END OF THE PROJECT GUTENBERG EBOOK POEMS OF POE ***
`;

export const VERSE_BOOK = { gutenbergId: 9999, title: 'Poems of Poe', author: 'Edgar Allan Poe', year: 1845, form: 'verse' } as const;

export async function seedVerseBook(db: Db) {
  await saveBook(db, VERSE_BOOK, cutBook(VERSE_FILE, VERSE_BOOK));
}

export const verseExcerpts = () => cutBook(VERSE_FILE, VERSE_BOOK);
