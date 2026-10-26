import { describe, it, expect } from 'vitest';
import { BrowserBookRepository, BrowserPoemRepository } from '@/lib/repositories';
import { DEFAULT_BACKEND, PoemService, BookService, bookService, createRepositories, poemService, readBackendKind } from '@/lib/services';

describe('choosing where the data lives', () => {
  it('is the browser unless something else is asked for', () => {
    expect(DEFAULT_BACKEND).toBe('browser');
    expect(readBackendKind(undefined)).toBe('browser');
    expect(readBackendKind('')).toBe('browser');
    expect(readBackendKind('   ')).toBe('browser');
    expect(readBackendKind('browser')).toBe('browser');
    expect(readBackendKind('  browser ')).toBe('browser');
  });

  it.each(['server', 'Browser', 'BROWSER', 'http', 'postgres', 'null', 'false'])('refuses %j, plainly, naming the setting', name => {
    expect(() => readBackendKind(name)).toThrow(`Unknown data backend "${name}". Set NEXT_PUBLIC_DATA_BACKEND to "browser"`);
  });

  it('builds the browser\'s repositories, with the bundled library behind the books', async () => {
    const { poems, books } = createRepositories('browser');
    expect(poems).toBeInstanceOf(BrowserPoemRepository);
    expect(books).toBeInstanceOf(BrowserBookRepository);
    expect((await books.listBooks()).map(b => b.title).sort()).toEqual(['Jane Eyre', 'The Picture of Dorian Gray', 'Walden']);
  });

  it('gives the screens services built on them', async () => {
    expect(poemService).toBeInstanceOf(PoemService);
    expect(bookService).toBeInstanceOf(BookService);
    expect((await bookService.listPassages()).length).toBe(3);
  });

  it('leaves the poem service with no repository of its own: it has to be given one', () => {
    // A default would be a second, hidden place where the choice is made. This is checked by the type
    // checker (`npx tsc --noEmit`): if the service ever accepted no repository, the comment below would
    // be reported as an unused "ts-expect-error".
    const neverRun = () => {
      // @ts-expect-error a PoemService is built from a repository
      return new PoemService();
    };
    expect(typeof neverRun).toBe('function');
  });
});
