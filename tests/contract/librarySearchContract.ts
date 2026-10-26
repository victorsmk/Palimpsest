import { describe, it, expect } from 'vitest';
import type { BookRepository } from '@/lib/repositories';
import type { Page, Passage } from '@/lib/models';
import { tokenize } from '@/lib/tokenizer';

/**
 * What every repository over a library of many books must do besides what BookRepository's own contract says:
 * find books by the words of their title and author (ignoring capitals and accents), give one book's excerpts
 * in order a page at a time, and give an excerpt's words as the tokenizer makes them. Run against the bundled
 * books and against the server's.
 */
export const libraryPassage = (id: string, bookId: string, title: string, author: string, text = 'the quiet woods were very still'): Passage => ({
  id,
  bookId,
  title: `${title} — Part`,
  description: `About ${id}`,
  sourceText: text,
  tokens: tokenize(id, text),
  attribution: { title, author, year: 1850, source: 'Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/1', licenseNote: 'Public domain in the USA' },
});

export type MakeLibrary = (passages: Passage[]) => BookRepository | Promise<BookRepository>;

async function walk<T>(first: (after?: string) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  let pages = 0;
  do {
    const page = await first(after);
    items.push(...page.items);
    after = page.next ?? undefined;
    if (++pages > 1000) throw new Error('The pages never end.');
  } while (after !== undefined);
  return items;
}

export function runLibrarySearchContract(name: string, make: MakeLibrary) {
  const fixtures = [
    libraryPassage('jane-1', 'jane', 'Jane Eyre', 'Charlotte Brontë'),
    libraryPassage('dorian-1', 'dorian', 'The Picture of Dorian Gray', 'Oscar Wilde'),
    libraryPassage('walden-1', 'walden', 'Walden', 'Henry David Thoreau'),
    libraryPassage('pride-1', 'pride', 'Pride and Prejudice', 'Jane Austen'),
  ];
  const found = async (search?: string) => {
    const repo = await make(fixtures);
    return (await walk(after => repo.listBooks({ after, limit: 2, search }))).map(book => book.title).sort();
  };

  describe(`library search contract: ${name}`, () => {
    it('finds every book for no search', async () => {
      expect(await found()).toEqual(['Jane Eyre', 'Pride and Prejudice', 'The Picture of Dorian Gray', 'Walden']);
      expect(await found('')).toHaveLength(4);
      expect(await found('   ')).toHaveLength(4);
    });

    it('ignores capitals and accents', async () => {
      expect(await found('BRONTE')).toEqual(['Jane Eyre']);
      expect(await found('brontë')).toEqual(['Jane Eyre']);
      expect(await found('walDEN')).toEqual(['Walden']);
    });

    it('finds by title or by author, or part of a word', async () => {
      expect(await found('wilde')).toEqual(['The Picture of Dorian Gray']);
      expect(await found('dorian')).toEqual(['The Picture of Dorian Gray']);
      expect(await found('thor')).toEqual(['Walden']);
    });

    it('wants every word of the search', async () => {
      expect(await found('jane')).toEqual(['Jane Eyre', 'Pride and Prejudice']); // one is the title, one the author
      expect(await found('jane austen')).toEqual(['Pride and Prejudice']);
      expect(await found('austen jane')).toEqual(['Pride and Prejudice']);
      expect(await found('jane wilde')).toEqual([]);
    });

    it('finds nothing for words in no book', async () => {
      expect(await found('zzzz')).toEqual([]);
    });

    it('gives each book once, however many pages it takes', async () => {
      const repo = await make(fixtures);
      const ids = (await walk(after => repo.listBooks({ after, limit: 1 }))).map(book => book.id);
      expect([...ids].sort()).toEqual(['dorian', 'jane', 'pride', 'walden']);
    });

    it('gives a book’s excerpts in their order, a page at a time, and only that book’s', async () => {
      const own = ['a', 'b', 'c', 'd', 'e'].map(letter => libraryPassage(`own-${letter}`, 'own', 'Own Book', 'An Author'));
      const repo = await make([...fixtures, ...own]);
      const ids = (await walk(after => repo.listPassageSummaries({ bookId: 'own', after, limit: 2 }))).map(summary => summary.id);
      expect(ids).toEqual(['own-a', 'own-b', 'own-c', 'own-d', 'own-e']);
      const first = await repo.listPassageSummaries({ bookId: 'own', limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.next).not.toBeNull();
      expect((await repo.listPassageSummaries({ bookId: 'no-such-book' })).items).toEqual([]);
    });

    it('gives an excerpt with its words as the tokenizer makes them, and nothing for an unknown one', async () => {
      const repo = await make(fixtures);
      const got = await repo.getPassage('walden-1');
      expect(got?.sourceText).toBe('the quiet woods were very still');
      expect(got?.tokens).toEqual(tokenize('walden-1', 'the quiet woods were very still'));
      expect(got?.attribution.author).toBe('Henry David Thoreau');
      expect(await repo.getPassage('nope')).toBeNull();
    });

    it('gives a book, and nothing for an unknown one', async () => {
      const repo = await make(fixtures);
      expect((await repo.getBook('jane'))?.author).toBe('Charlotte Brontë');
      expect(await repo.getBook('nope')).toBeNull();
    });
  });
}
