import { describe, it, expect } from 'vitest';
import { BrowserBookRepository, BrowserPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';
import { StorageError, type Passage, type Poem } from '@/lib/models';

describe('BrowserBookRepository', () => {
  const dummyPassages: Passage[] = [
    {
      id: 'passage-1',
      bookId: 'book-a',
      title: 'Passage 1',
      description: 'Opening of Book A',
      sourceText: 'Some text here.',
      tokens: [],
      attribution: {
        title: 'Book A',
        author: 'Author A',
        year: 1900,
        source: 'Project Gutenberg',
        url: 'https://www.gutenberg.org/ebooks/1',
        licenseNote: 'Public domain',
      },
    },
    {
      id: 'passage-2',
      bookId: 'book-a',
      title: 'Passage 2',
      description: 'Second part of Book A',
      sourceText: 'More text here.',
      tokens: [],
      attribution: {
        title: 'Book A',
        author: 'Author A',
        year: 1900,
        source: 'Project Gutenberg',
        url: 'https://www.gutenberg.org/ebooks/1',
        licenseNote: 'Public domain',
      },
    },
    {
      id: 'passage-3',
      bookId: 'book-b',
      title: 'Passage 3',
      description: 'Opening of Book B',
      sourceText: 'Another book text.',
      tokens: [],
      attribution: {
        title: 'Book B',
        author: 'Author B',
        year: 1910,
        source: 'Project Gutenberg',
        url: 'https://www.gutenberg.org/ebooks/2',
        licenseNote: 'Public domain',
      },
    },
  ];

  it('lists distinct books derived from passages', async () => {
    const repo = new BrowserBookRepository(dummyPassages);
    const books = (await repo.listBooks()).items;
    expect(books).toHaveLength(2);
    expect(books.map(b => b.id).sort()).toEqual(['book-a', 'book-b']);
  });

  it('gets a single book by id or returns null', async () => {
    const repo = new BrowserBookRepository(dummyPassages);
    const book = await repo.getBook('book-a');
    expect(book).not.toBeNull();
    expect(book?.title).toBe('Book A');

    const missing = await repo.getBook('non-existent');
    expect(missing).toBeNull();
  });

  it('gets passage by id', async () => {
    const repo = new BrowserBookRepository(dummyPassages);
    const passage = await repo.getPassage('passage-2');
    expect(passage?.title).toBe('Passage 2');

    const missing = await repo.getPassage('invalid');
    expect(missing).toBeNull();
  });

  it('lists passage summaries of a specific book', async () => {
    const repo = new BrowserBookRepository(dummyPassages);
    const passagesA = (await repo.listPassageSummaries({ bookId: 'book-a' })).items;
    expect(passagesA).toHaveLength(2);

    const passagesB = (await repo.listPassageSummaries({ bookId: 'book-b' })).items;
    expect(passagesB).toHaveLength(1);

    const passagesC = (await repo.listPassageSummaries({ bookId: 'book-c' })).items;
    expect(passagesC).toHaveLength(0);
  });
});

describe('BrowserPoemRepository', () => {
  const dummyPoem: Poem = {
    id: 'poem-1',
    schemaVersion: 2, revision: 1,
    passageId: 'passage-1',
    retainedTokenIds: ['tok-1', 'tok-2'],
    lineBreaks: ['tok-2'],
    erasureStyle: 'blackout',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: 'Test Poem',
  };

  it('saves, retrieves, lists, and deletes poems', async () => {
    const storage = new MemoryStorageAdapter();
    const repo = new BrowserPoemRepository(storage);

    expect((await repo.list()).items).toHaveLength(0);
    expect(await repo.get('poem-1')).toBeNull();

    await repo.importMany([dummyPoem]);

    const retrieved = await repo.get('poem-1');
    expect(retrieved).toEqual(dummyPoem);

    const list = (await repo.list()).items;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('poem-1');

    await repo.delete('poem-1');
    expect(await repo.get('poem-1')).toBeNull();
    expect((await repo.list()).items).toHaveLength(0);
  });

  it('handles invalid or corrupted JSON gracefully', async () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('palimpsest:poems:v1', 'NOT_VALID_JSON{[');
    const repo = new BrowserPoemRepository(storage);

    const list = (await repo.list()).items;
    expect(list).toEqual([]);
    expect(await repo.get('poem-1')).toBeNull();
  });

  describe('validation of persisted data', () => {
    const KEY = 'palimpsest:poems:v1';

    function seed(entries: Record<string, unknown>) {
      const storage = new MemoryStorageAdapter();
      storage.setItem(KEY, JSON.stringify(entries));
      return { storage, repo: new BrowserPoemRepository(storage) };
    }

    it('ignores a top-level array or non-object payload', async () => {
      for (const payload of ['[]', '"text"', '42', 'null']) {
        const storage = new MemoryStorageAdapter();
        storage.setItem(KEY, payload);
        expect((await new BrowserPoemRepository(storage).list()).items).toEqual([]);
      }
    });

    it('skips entries with the wrong shape but still returns valid ones', async () => {
      const { repo } = seed({
        'poem-1': dummyPoem,
        'no-passage': { ...dummyPoem, id: 'no-passage', passageId: undefined },
        'bad-tokens': { ...dummyPoem, id: 'bad-tokens', retainedTokenIds: ['tok-1', 7] },
        'bad-style': { ...dummyPoem, id: 'bad-style', erasureStyle: 'watercolor' },
        'bad-date': { ...dummyPoem, id: 'bad-date', createdAt: 'yesterday-ish' },
        'bad-title': { ...dummyPoem, id: 'bad-title', title: 12 },
        'not-an-object': 'poem',
      });

      const list = (await repo.list()).items;
      expect(list.map(p => p.id)).toEqual(['poem-1']);
      expect(await repo.get('bad-style')).toBeNull();
      expect(await repo.get('not-an-object')).toBeNull();
    });

    it('rejects entries whose key does not match their id', async () => {
      const { repo } = seed({ 'poem-1': { ...dummyPoem, id: 'someone-else' } });
      expect(await repo.get('poem-1')).toBeNull();
      expect((await repo.list()).items).toEqual([]);
    });

    it('rejects line breaks that are not on retained tokens', async () => {
      const { repo } = seed({ 'poem-1': { ...dummyPoem, lineBreaks: ['tok-99'] } });
      expect(await repo.get('poem-1')).toBeNull();
    });

    it('rejects missing, non-integer, zero, and future schema versions', async () => {
      const { repo } = seed({
        missing: { ...dummyPoem, id: 'missing', schemaVersion: undefined },
        fractional: { ...dummyPoem, id: 'fractional', schemaVersion: 1.5 },
        zero: { ...dummyPoem, id: 'zero', schemaVersion: 0 },
        stringy: { ...dummyPoem, id: 'stringy', schemaVersion: '1' },
        future: { ...dummyPoem, id: 'future', schemaVersion: 3 },
      });
      expect((await repo.list()).items).toEqual([]);
    });

    it('does not destroy unreadable entries when saving or deleting other poems', async () => {
      const future = { ...dummyPoem, id: 'future', schemaVersion: 99, extra: 'from a newer build' };
      const { storage, repo } = seed({ future });

      await repo.importMany([dummyPoem]);
      expect(((await repo.list()).items).map(p => p.id)).toEqual(['poem-1']);

      await repo.delete('poem-1');
      const stored = JSON.parse(storage.getItem(KEY)!);
      expect(stored.future).toEqual(future);
    });

    it('round-trips a poem with no optional title or notes', async () => {
      const bare: Poem = { ...dummyPoem, id: 'bare' };
      delete bare.title;
      const repo = new BrowserPoemRepository(new MemoryStorageAdapter());
      await repo.importMany([bare]);
      expect(await repo.get('bare')).toEqual(bare);
    });

    it('rejects save() when storage cannot be written', async () => {
      const failing = {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
        removeItem: () => {},
      };
      const repo = new BrowserPoemRepository(failing);
      await expect(repo.importMany([dummyPoem])).rejects.toBeInstanceOf(StorageError);
    });
  });
});
