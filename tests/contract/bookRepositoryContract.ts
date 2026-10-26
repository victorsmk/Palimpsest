import { describe, it, expect } from 'vitest';
import type { BookRepository } from '@/lib/repositories';
import { LIMITS, type Page, type Passage } from '@/lib/models';
import { tokenize } from '@/lib/tokenizer';

/**
 * What every BookRepository must do, whatever stores the books behind it. Lists are summaries in a
 * fixed order, a page at a time; a passage's text and words come one passage at a time. Written once
 * and run against each implementation, as the poem repository's contract is.
 */
export const passage = (id: string, bookId: string, text = 'one two three'): Passage => ({
  id,
  bookId,
  title: `Passage ${id}`,
  description: `About ${id}`,
  sourceText: text,
  tokens: tokenize(id, text),
  attribution: { title: `Book ${bookId}`, author: 'A', year: 1900, source: 'Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/1', licenseNote: 'Public domain in the USA' },
});

/** Makes a repository holding exactly these passages, in this order. */
export type MakeBooks = (passages: Passage[]) => BookRepository | Promise<BookRepository>;

async function walk<T>(first: (after?: string) => Promise<Page<T>>): Promise<{ items: T[]; pages: number }> {
  const items: T[] = [];
  let after: string | undefined;
  let pages = 0;
  do {
    const page = await first(after);
    pages++;
    items.push(...page.items);
    after = page.next ?? undefined;
    if (pages > 1000) throw new Error('The pages never end.');
  } while (after !== undefined);
  return { items, pages };
}

export function runBookRepositoryContract(name: string, make: MakeBooks) {
  describe(`BookRepository contract: ${name}`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => passage(`p${String(i).padStart(3, '0')}`, `b${i % 7}`));

    describe('an empty library', () => {
      it('lists nothing and finds nothing', async () => {
        const repo = await make([]);
        expect(await repo.listBooks()).toEqual({ items: [], next: null });
        expect(await repo.listPassageSummaries()).toEqual({ items: [], next: null });
        expect(await repo.getPassage('x')).toBeNull();
        expect(await repo.getBook('x')).toBeNull();
      });
    });

    describe('passage summaries', () => {
      it('have no text and no words, and everything else', async () => {
        const repo = await make([passage('a', 'book')]);
        const [summary] = (await repo.listPassageSummaries()).items;
        expect(summary).toEqual({ id: 'a', bookId: 'book', title: 'Passage a', description: 'About a', attribution: passage('a', 'book').attribution });
        expect('sourceText' in summary).toBe(false);
        expect('tokens' in summary).toBe(false);
      });

      it('come in the library order, every one once', async () => {
        const repo = await make([passage('c', 'x'), passage('a', 'x'), passage('b', 'y')]);
        expect((await repo.listPassageSummaries()).items.map(p => p.id)).toEqual(['c', 'a', 'b']);
      });

      it('can be limited to the passages of one book, in order', async () => {
        const repo = await make([passage('a1', 'a'), passage('b1', 'b'), passage('a2', 'a')]);
        expect((await repo.listPassageSummaries({ bookId: 'a' })).items.map(p => p.id)).toEqual(['a1', 'a2']);
        expect((await repo.listPassageSummaries({ bookId: 'nope' })).items).toEqual([]);
      });
    });

    describe('one passage', () => {
      it('is given whole, with its text and its words', async () => {
        const original = passage('a', 'book', 'the quick brown fox');
        const repo = await make([original]);
        const got = (await repo.getPassage('a'))!;
        expect(got.sourceText).toBe('the quick brown fox');
        expect(got.tokens).toEqual(original.tokens);
        expect(got.tokens.length).toBeGreaterThan(0);
      });

      it('is null when there is none with that id, including names every object has', async () => {
        const repo = await make([passage('a', 'book')]);
        for (const id of ['missing', 'constructor', '__proto__', 'toString', '']) expect(await repo.getPassage(id)).toBeNull();
      });
    });

    describe('books', () => {
      it('are listed once each, in the order their first passage comes, and found by id', async () => {
        const repo = await make([passage('a1', 'a'), passage('b1', 'b'), passage('a2', 'a')]);
        expect((await repo.listBooks()).items.map(b => b.id)).toEqual(['a', 'b']);
        expect((await repo.getBook('b'))?.title).toBe('Book b');
        expect(await repo.getBook('nope')).toBeNull();
      });
    });

    describe('paging', () => {
      it('gives the default number of items on a page, with a way to ask for the next', async () => {
        const repo = await make(many(LIMITS.pageDefault + 20));
        const first = await repo.listPassageSummaries();
        expect(first.items).toHaveLength(LIMITS.pageDefault);
        expect(first.next).toBe(first.items[first.items.length - 1].id);
        const second = await repo.listPassageSummaries({ after: first.next! });
        expect(second.items).toHaveLength(20);
        expect(second.next).toBeNull();
      });

      it('walks the whole list in order, none missed and none twice, whatever the page size', async () => {
        const all = many(23);
        const repo = await make(all);
        for (const limit of [1, 2, 5, 7, 22, 23, 24, 500]) {
          const { items } = await walk(after => repo.listPassageSummaries({ after, limit }));
          expect(items.map(p => p.id)).toEqual(all.map(p => p.id));
        }
      });

      it('ends exactly on the last item: a list that fills a page has no empty page after it', async () => {
        const repo = await make(many(10));
        const { items, pages } = await walk(after => repo.listPassageSummaries({ after, limit: 5 }));
        expect(items).toHaveLength(10);
        expect(pages).toBe(2);
        expect((await repo.listPassageSummaries({ limit: 10 })).next).toBeNull();
      });

      it('pages the books too', async () => {
        const repo = await make(many(23));
        const { items, pages } = await walk(after => repo.listBooks({ after, limit: 3 }));
        expect(items.map(b => b.id)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
        expect(pages).toBe(3);
      });

      it('pages within one book', async () => {
        const repo = await make(many(23));
        const { items } = await walk(after => repo.listPassageSummaries({ bookId: 'b3', after, limit: 2 }));
        expect(items.map(p => p.id)).toEqual(many(23).filter(p => p.bookId === 'b3').map(p => p.id));
      });

      it('keeps a page size within bounds: too small, too large, or not a whole number', async () => {
        const repo = await make(many(LIMITS.pageMax + 10));
        expect((await repo.listPassageSummaries({ limit: 0 })).items).toHaveLength(1);
        expect((await repo.listPassageSummaries({ limit: -5 })).items).toHaveLength(1);
        expect((await repo.listPassageSummaries({ limit: 100_000 })).items).toHaveLength(LIMITS.pageMax);
        expect((await repo.listPassageSummaries({ limit: 2.5 })).items).toHaveLength(LIMITS.pageDefault);
        expect((await repo.listPassageSummaries({ limit: Number.NaN })).items).toHaveLength(LIMITS.pageDefault);
      });

      it('ends a walk, not restarts it, when the cursor names nothing', async () => {
        const repo = await make(many(5));
        expect(await repo.listPassageSummaries({ after: 'not-there' })).toEqual({ items: [], next: null });
        expect(await repo.listBooks({ after: '__proto__' })).toEqual({ items: [], next: null });
      });
    });
  });
}
