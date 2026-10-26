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
