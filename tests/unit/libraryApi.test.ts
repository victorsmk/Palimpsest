import { describe, it, expect, afterAll, vi } from 'vitest';
import type { Book, Page, PassageSummary } from '@/lib/models';
import { createLibraryApi, CACHE_LIST, CACHE_PASSAGE } from '@/lib/server/api/library';
import { createTestDb } from '../helpers/pgliteDb';
import { excerptsOf, seedPassages, seedRealBooks } from '../helpers/library';
import { libraryPassage } from '../contract/librarySearchContract';

// The library's side of the API on real SQL with three real books: what is listed and in what order, how a
// search finds books, the pages, the excerpts, how long answers may be kept, and what is said when something is wrong.

const db = await createTestDb();
await seedRealBooks(db, 'walden', 'janeEyre', 'dorianGray'); // stored in any order: listed by title
afterAll(() => db.close());
const api = createLibraryApi({ db });

const get = (path: string) => new Request(`http://localhost${path}`);
const books = async (query = '') => (await (await api.books(get(`/api/library/books${query}`))).json()) as Page<Book>;
const titles = async (query = '') => (await books(query)).items.map(b => b.title);

describe('listing the books', () => {
  it('lists them by title, leaving off a leading The, with the facts about each', async () => {
    const page = await books();
    expect(page.items.map(b => b.title)).toEqual(['Jane Eyre', 'The Picture of Dorian Gray', 'Walden']);
    expect(page.next).toBeNull();
    expect(page.items[0]).toEqual({
      id: 'pg1260',
      title: 'Jane Eyre',
      author: 'Charlotte Brontë',
      year: 1847,
      attribution: { title: 'Jane Eyre', author: 'Charlotte Brontë', year: 1847, source: 'Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/1260', licenseNote: 'Public domain in the USA' },
    });
  });

  it('puts a book in order by its title without a leading The, A or An', async () => {
    const other = await createTestDb();
    await seedPassages(other, [
      libraryPassage('b-1', 'b', 'Banana Peel', 'X'),
      libraryPassage('t-1', 't', 'The Apple Tree', 'X'),
      libraryPassage('a-1', 'a', 'An Egg', 'X'),
      libraryPassage('c-1', 'c', 'Cat', 'X'),
    ]);
    const page = (await (await createLibraryApi({ db: other }).books(get('/api/library/books'))).json()) as Page<Book>;
    expect(page.items.map(b => b.title)).toEqual(['The Apple Tree', 'Banana Peel', 'Cat', 'An Egg']);
    await other.close();
  });

  it('needs no sign-in', async () => {
    const response = await api.books(get('/api/library/books'));
    expect(response.status).toBe(200);
  });

  it('comes a page at a time, with a cursor that leads to the next, and ends', async () => {
    const seen: string[] = [];
    let after: string | undefined;
    let pages = 0;
    do {
      const page = await books(`?limit=1${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      seen.push(...page.items.map(b => b.title));
      after = page.next ?? undefined;
      pages++;
    } while (after && pages < 10);
    expect(seen).toEqual(['Jane Eyre', 'The Picture of Dorian Gray', 'Walden']);
    expect(pages).toBe(3);
  });

  it('ends a walk, with an empty page, for a cursor that means nothing', async () => {
    expect(await books('?after=garbage')).toEqual({ items: [], next: null });
    expect(await books(`?after=${Buffer.from('[1,2]').toString('base64url')}`)).toEqual({ items: [], next: null });
  });
});

describe('searching the books', () => {
  it('ignores capitals', async () => {
    expect(await titles('?search=WALDEN')).toEqual(['Walden']);
    expect(await titles('?search=jane%20eyre')).toEqual(['Jane Eyre']);
  });

  it('ignores accents, both ways', async () => {
    expect(await titles('?search=bronte')).toEqual(['Jane Eyre']);
    expect(await titles(`?search=${encodeURIComponent('BRONTË')}`)).toEqual(['Jane Eyre']);
    expect(await titles(`?search=${encodeURIComponent('Brontë')}`)).toEqual(['Jane Eyre']);
  });

  it('finds a book by its author', async () => {
    expect(await titles('?search=wilde')).toEqual(['The Picture of Dorian Gray']);
    expect(await titles('?search=thoreau')).toEqual(['Walden']);
  });

  it('finds part of a word', async () => {
    expect(await titles('?search=wal')).toEqual(['Walden']);
    expect(await titles('?search=dorian')).toEqual(['The Picture of Dorian Gray']);
  });

  it('wants every word, in the title and author together and in any order', async () => {
    expect(await titles('?search=oscar%20dorian')).toEqual(['The Picture of Dorian Gray']);
    expect(await titles('?search=dorian%20oscar')).toEqual(['The Picture of Dorian Gray']);
    expect(await titles('?search=jane%20wilde')).toEqual([]);
  });

  it('finds nothing for words that are in no book, and everything for no words', async () => {
    expect(await titles('?search=zzzz')).toEqual([]);
    expect(await titles('?search=')).toHaveLength(3);
    expect(await titles('?search=%20%20')).toHaveLength(3);
  });

  it('takes characters that mean something to a database as plain characters', async () => {
    for (const search of ["%", "_", "'", "\\", "'; drop table books; --", '%_', '"']) expect(await titles(`?search=${encodeURIComponent(search)}`)).toEqual([]);
    expect(await titles('')).toHaveLength(3); // and nothing was dropped
  });

  it('pages through the matches of a search', async () => {
    const first = await books('?search=e&limit=1');
    expect(first.items).toHaveLength(1);
    expect(first.next).not.toBeNull();
    const second = await books(`?search=e&limit=1&after=${encodeURIComponent(first.next!)}`);
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });

  it('refuses a search that is too long', async () => {
    const response = await api.books(get(`/api/library/books?search=${'a'.repeat(101)}`));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('invalid');
  });
});

describe('one book', () => {
  it('is found by its id', async () => {
    const response = await api.book(get('/api/library/books/pg205'), 'pg205');
    expect(response.status).toBe(200);
    expect(((await response.json()) as Book).title).toBe('Walden');
  });

  it('is not found when there is none, or when the id could not be one', async () => {
    for (const id of ['pg999', 'x'.repeat(200), 'a b', '../poems']) {
      const response = await api.book(get('/api/library/books/x'), id);
      expect(response.status, id).toBe(404);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('gone');
    }
  });
});

describe('the excerpts of a book', () => {
  const list = async (id: string, query = '') => api.bookPassages(get(`/api/library/books/${id}/passages${query}`), id);
  type Item = PassageSummary & { wordCount: number };

  it('are listed in their order, without their text, each with its title, first words and size', async () => {
    const page = (await (await list('pg174', '?limit=3')).json()) as Page<Item>;
    expect(page.items.map(p => p.id)).toEqual(['pg174-0001', 'pg174-0002', 'pg174-0003']);
    const expected = excerptsOf('dorianGray')[0];
    expect(page.items[0]).toEqual({
      id: 'pg174-0001',
      bookId: 'pg174',
      title: expected.title,
      description: expected.description,
      wordCount: expected.wordCount,
      attribution: { title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', year: 1890, source: 'Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/174', licenseNote: 'Public domain in the USA' },
    });
    expect(JSON.stringify(page)).not.toContain('sourceText');
    expect(page.next).toBe('3');
  });

  it('come a page at a time, and every excerpt of the book is on exactly one page', async () => {
    const all: string[] = [];
    let after: string | undefined;
    let pages = 0;
    do {
      const page = (await (await list('pg174', `?limit=50${after ? `&after=${after}` : ''}`)).json()) as Page<Item>;
      all.push(...page.items.map(p => p.id));
      after = page.next ?? undefined;
      pages++;
    } while (after && pages < 100);
    expect(all).toEqual(excerptsOf('dorianGray').map(e => e.id));
    expect(pages).toBe(Math.ceil(excerptsOf('dorianGray').length / 50));
  });

  it('ends a walk, with an empty page, for a cursor that means nothing or is past the end', async () => {
    expect(await (await list('pg174', '?after=abc')).json()).toEqual({ items: [], next: null });
    expect(await (await list('pg174', '?after=99999')).json()).toEqual({ items: [], next: null });
  });

  it('are not mixed with another book’s', async () => {
    const page = (await (await list('pg205', '?limit=500')).json()) as Page<Item>;
    expect(page.items.every(p => p.bookId === 'pg205' && p.id.startsWith('pg205-'))).toBe(true);
  });

  it('are not there for a book that is not', async () => {
    expect((await list('pg999')).status).toBe(404);
  });
});

describe('one excerpt', () => {
  it('has its text, exactly as it was cut, and what is needed to credit it', async () => {
    const response = await api.passage(get('/api/library/passages/pg174-0005'), 'pg174-0005');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; sourceText: string; title: string; attribution: { url: string } };
    const expected = excerptsOf('dorianGray')[4];
    expect(body.id).toBe('pg174-0005');
    expect(body.sourceText).toBe(expected.sourceText);
    expect(body.title).toBe(expected.title);
    expect(body.attribution.url).toBe('https://www.gutenberg.org/ebooks/174');
  });

  it('says where it sits in its book, and which excerpts come before and after', async () => {
    const total = excerptsOf('dorianGray').length;
    const read = async (id: string) => ((await (await api.passage(get('/x'), id)).json()) as { position: { ordinal: number; count: number; previousId: string | null; nextId: string | null } }).position;
    expect(await read('pg174-0001')).toEqual({ ordinal: 1, count: total, previousId: null, nextId: 'pg174-0002' });
    expect(await read('pg174-0050')).toEqual({ ordinal: 50, count: total, previousId: 'pg174-0049', nextId: 'pg174-0051' });
    expect(await read(`pg174-${String(total).padStart(4, '0')}`)).toEqual({ ordinal: total, count: total, previousId: `pg174-${String(total - 1).padStart(4, '0')}`, nextId: null });
  });

  it('is not found when there is none', async () => {
    for (const id of ['pg174-9999', 'walden-woods', '../x']) expect((await api.passage(get('/api/library/passages/x'), id)).status, id).toBe(404);
  });
});

describe('how long answers may be kept', () => {
  it('lets an excerpt’s text be kept for good, because it never changes', async () => {
    const response = await api.passage(get('/api/library/passages/pg174-0001'), 'pg174-0001');
    expect(response.headers.get('cache-control')).toBe(CACHE_PASSAGE);
    expect(CACHE_PASSAGE).toMatch(/immutable/);
    expect(CACHE_PASSAGE).toMatch(/s-maxage=31536000/);
  });

  it('lets the lists be kept for minutes only, because books are added', async () => {
    for (const response of [await api.books(get('/api/library/books')), await api.book(get('/x'), 'pg174'), await api.bookPassages(get('/x'), 'pg174')]) {
      expect(response.headers.get('cache-control')).toBe(CACHE_LIST);
    }
    expect(CACHE_LIST).not.toMatch(/immutable/);
    expect(CACHE_LIST).toMatch(/s-maxage=300/);
  });

  it('keeps nothing of an answer that says no', async () => {
    expect((await api.passage(get('/x'), 'nope')).headers.get('cache-control')).toBe('no-store');
    expect((await api.books(get(`/api/library/books?search=${'a'.repeat(101)}`))).headers.get('cache-control')).toBe('no-store');
  });
});

describe('when the database cannot be read', () => {
  it('says the server could not be reached, in the usual error body, and shows nothing of the cause', async () => {
    const broken = await createTestDb();
    broken.failWrites();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const library = createLibraryApi({ db: broken });
    for (const response of [await library.books(get('/x')), await library.book(get('/x'), 'pg1'), await library.bookPassages(get('/x'), 'pg1'), await library.passage(get('/x'), 'pg1-0001')]) {
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(JSON.parse(text).error.code).toBe('unavailable');
      expect(text).not.toMatch(/connection lost|select |books/i);
    }
    log.mockRestore();
    await broken.close();
  });
});
