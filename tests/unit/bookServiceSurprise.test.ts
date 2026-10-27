import { describe, it, expect } from 'vitest';
import { BookService } from '@/lib/services/BookService';
import { BrowserBookRepository } from '@/lib/repositories';
import type { BookRepository } from '@/lib/repositories';
import type { Passage } from '@/lib/models';
import { tokenize } from '@/lib/tokenizer';

const passage = (id: string): Passage => ({
  id,
  bookId: 'b',
  title: 'T',
  description: 'd',
  sourceText: 'one two three',
  tokens: tokenize(id, 'one two three'),
  attribution: { title: 'T', author: 'A', year: 1900, source: 'S', url: 'u', licenseNote: 'n' },
});

const remote = (ids: string[], random?: () => Promise<string | null>): BookRepository => ({
  listBooks: async () => ({ items: [], next: null }),
  getBook: async () => null,
  getPassage: async id => (ids.includes(id) ? passage(id) : null),
  listPassageSummaries: async () => ({ items: [], next: null }),
  ...(random ? { randomPassageId: random } : {}),
});

describe('a surprise from the library', () => {
  it('is an excerpt of the server’s library, in full', async () => {
    const service = new BookService(new BrowserBookRepository([]), remote(['x-1'], async () => 'x-1'));
    expect((await service.surprise())?.id).toBe('x-1');
  });

  it('is nothing without a library, or when the library has no way to choose, or has nothing', async () => {
    expect(await new BookService(new BrowserBookRepository([])).surprise()).toBeNull();
    expect(await new BookService(new BrowserBookRepository([]), remote(['x-1'])).surprise()).toBeNull();
    expect(await new BookService(new BrowserBookRepository([]), remote([], async () => null)).surprise()).toBeNull();
  });

  it('is nothing when the library chose an excerpt that is gone', async () => {
    expect(await new BookService(new BrowserBookRepository([]), remote([], async () => 'gone-1')).surprise()).toBeNull();
  });

  it('fails when the library cannot be reached, so that the screen can say so', async () => {
    const down = remote([], async () => {
      throw new Error('down');
    });
    await expect(new BookService(new BrowserBookRepository([]), down).surprise()).rejects.toThrow('down');
  });
});

describe('the reader’s own texts in the list of books', () => {
  const own = (listBooks: BookRepository['listBooks']): BookRepository => ({ ...remote([]), listBooks });

  it('are listed when they can be read', async () => {
    const book = { id: 'my-aaaaaaaa', title: 'Mine', author: 'Me', year: 2026, attribution: passage('x').attribution };
    const service = new BookService(new BrowserBookRepository([]), null, own(async () => ({ items: [book], next: null })));
    expect((await service.listOwnBooks()).items.map(b => b.id)).toEqual(['my-aaaaaaaa']);
  });

  it('are left out, not an error, when the account cannot be reached, so the library can still be chosen from', async () => {
    const service = new BookService(new BrowserBookRepository([]), null, own(async () => { throw new Error('down'); }));
    await expect(service.listOwnBooks()).resolves.toEqual({ items: [], next: null });
  });
});
