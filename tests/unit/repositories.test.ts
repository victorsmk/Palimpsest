import { describe, it, expect } from 'vitest';
import { BrowserBookRepository, BrowserPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';
import type { Passage, Poem } from '@/lib/models';

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
    const books = await repo.listBooks();
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

  it('lists passages belonging to a specific book', async () => {
    const repo = new BrowserBookRepository(dummyPassages);
    const passagesA = await repo.listPassages('book-a');
    expect(passagesA).toHaveLength(2);

    const passagesB = await repo.listPassages('book-b');
    expect(passagesB).toHaveLength(1);

    const passagesC = await repo.listPassages('book-c');
    expect(passagesC).toHaveLength(0);
  });
});

describe('BrowserPoemRepository', () => {
  const dummyPoem: Poem = {
    id: 'poem-1',
    schemaVersion: 1,
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

    expect(await repo.list()).toHaveLength(0);
    expect(await repo.get('poem-1')).toBeNull();

    await repo.save(dummyPoem);

    const retrieved = await repo.get('poem-1');
    expect(retrieved).toEqual(dummyPoem);

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('poem-1');

    await repo.delete('poem-1');
    expect(await repo.get('poem-1')).toBeNull();
    expect(await repo.list()).toHaveLength(0);
  });

  it('handles invalid or corrupted JSON gracefully', async () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('palimpsest:poems:v1', 'NOT_VALID_JSON{[');
    const repo = new BrowserPoemRepository(storage);

    const list = await repo.list();
    expect(list).toEqual([]);
    expect(await repo.get('poem-1')).toBeNull();
  });
});
