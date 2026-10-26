import { describe, it, expect, afterAll, vi } from 'vitest';
import { OfflineError, RateLimitedError, UnavailableError, type Passage } from '@/lib/models';
import { tokenize } from '@/lib/tokenizer';
import { BrowserBookRepository } from '@/lib/repositories';
import { HttpBookRepository } from '@/lib/repositories/http/HttpBookRepository';
import { BookService } from '@/lib/services/BookService';
import { reopenPoem } from '@/lib/editor';
import { createLibraryApi } from '@/lib/server/api/library';
import type { PoemsApi } from '@/lib/server/api/handlers';
import { createTestDb } from '../helpers/pgliteDb';
import { inProcessFetch } from '../helpers/inProcessApi';
import { excerptsOf, seedRealBooks } from '../helpers/library';
import { libraryPassage } from '../contract/librarySearchContract';

// The browser's side of the library: reading it over HTTP, what it says when the server fails or sends something
// odd, and the shared PassageLibrary reaching excerpts that it does not list.

const db = await createTestDb();
await seedRealBooks(db, 'dorianGray');
afterAll(() => db.close());
const real = new HttpBookRepository({ fetch: inProcessFetch({} as PoemsApi, createLibraryApi({ db })) });

const answering = (status: number, body: unknown = {}) =>
  new HttpBookRepository({ fetch: (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as typeof fetch });

describe('an excerpt read from the server', () => {
  it('has the words the tokenizer makes of its text, with the ids that saved poems point at', async () => {
    const passage = (await real.getPassage('pg174-0003')) as Passage;
    const expected = excerptsOf('dorianGray')[2];
    expect(passage.sourceText).toBe(expected.sourceText);
    expect(passage.tokens).toEqual(tokenize('pg174-0003', expected.sourceText));
    expect(passage.tokens[0].id).toBe('pg174-0003-token-0000');
    // The count is of words between spaces; the tokenizer also breaks words joined by a dash, so it finds a few more.
    const selectable = passage.tokens.filter(t => t.isSelectable).length;
    expect(selectable).toBeGreaterThanOrEqual(expected.wordCount);
    expect(selectable).toBeLessThan(expected.wordCount * 1.1);
    expect(passage.attribution.author).toBe('Oscar Wilde');
    expect(passage.bookId).toBe('pg174');
  });

  it('has its place in its book, for stepping to the one before or after', async () => {
    const total = excerptsOf('dorianGray').length;
    expect((await real.getPassage('pg174-0001'))?.position).toEqual({ ordinal: 1, count: total, previousId: null, nextId: 'pg174-0002' });
    expect((await real.getPassage('pg174-0002'))?.position).toMatchObject({ ordinal: 2, previousId: 'pg174-0001', nextId: 'pg174-0003' });
  });

  it('is an unavailable server, and not a passage, when the place it sends makes no sense', async () => {
    const odd = (position: unknown) => answering(200, { id: 'x', bookId: 'b', title: 't', description: 'd', sourceText: 'one two', attribution: { title: 'B', author: 'A', year: 1900, source: 's', url: 'u', licenseNote: 'l' }, position });
    await expect(odd({ ordinal: 'one', count: 3, previousId: null, nextId: null }).getPassage('x')).rejects.toBeInstanceOf(UnavailableError);
    await expect(odd({ ordinal: 1, count: 3, previousId: 5, nextId: null }).getPassage('x')).rejects.toBeInstanceOf(UnavailableError);
    expect((await odd(undefined).getPassage('x'))?.position).toBeUndefined();
  });

  it('is nothing for an excerpt that is not there', async () => {
    expect(await real.getPassage('pg174-9999')).toBeNull();
    expect(await real.getBook('pg1')).toBeNull();
    expect(await real.listPassageSummaries({ bookId: 'pg1' })).toEqual({ items: [], next: null });
  });

  it('asks the server for the right things: the search, the cursor and the limit, and a book by name', async () => {
    const seen: string[] = [];
    const repo = new HttpBookRepository({ fetch: (async (input: RequestInfo | URL) => (seen.push(String(input)), new Response('{"items":[],"next":null}'))) as typeof fetch });
    await repo.listBooks({ search: 'Brontë & Co', after: 'abc', limit: 5 });
    await repo.listBooks();
    await repo.listPassageSummaries({ bookId: 'pg 1', after: '40', limit: 50 });
    expect(seen[0]).toBe('/api/library/books?after=abc&limit=5&search=Bront%C3%AB+%26+Co');
    expect(seen[1]).toBe('/api/library/books');
    expect(seen[2]).toBe('/api/library/books/pg%201/passages?after=40&limit=50');
  });

  it('asks for a book’s excerpts only when a book is named: the whole library is too many to list', async () => {
    const calls = vi.fn();
    const repo = new HttpBookRepository({ fetch: (async () => (calls(), new Response('{}'))) as typeof fetch });
    expect(await repo.listPassageSummaries()).toEqual({ items: [], next: null });
    expect(calls).not.toHaveBeenCalled();
  });
});

describe('when the library cannot be read', () => {
  it('is an unavailable server when the request fails', async () => {
    const repo = new HttpBookRepository({ fetch: (async () => Promise.reject(new TypeError('failed'))) as typeof fetch });
    await expect(repo.getPassage('x')).rejects.toBeInstanceOf(UnavailableError);
    await expect(repo.listBooks()).rejects.toBeInstanceOf(UnavailableError);
  });

  it('is being offline, when the browser says so', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const repo = new HttpBookRepository({ fetch: (async () => Promise.reject(new TypeError('failed'))) as typeof fetch });
    await expect(repo.getPassage('x')).rejects.toBeInstanceOf(OfflineError);
    vi.unstubAllGlobals();
  });

  it('is unavailable for a server error, and rate limited for a 429', async () => {
    await expect(answering(500).getPassage('x')).rejects.toBeInstanceOf(UnavailableError);
    await expect(answering(503).listBooks()).rejects.toBeInstanceOf(UnavailableError);
    await expect(answering(429).getPassage('x')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('is unavailable, and not an empty library, when the answer is not what the server sends', async () => {
    await expect(answering(200, 'not json').listBooks()).rejects.toBeInstanceOf(UnavailableError);
    await expect(answering(200, { items: [{ id: 1 }], next: null }).listBooks()).rejects.toBeInstanceOf(UnavailableError);
    await expect(answering(200, { items: [], next: 5 }).listBooks()).rejects.toBeInstanceOf(UnavailableError);
    await expect(answering(200, { id: 'x' }).getPassage('x')).rejects.toBeInstanceOf(UnavailableError);
    await expect(answering(200, { id: 'x' }).getBook('x')).rejects.toBeInstanceOf(UnavailableError);
    await expect(answering(200, [{ id: 'x' }]).listPassageSummaries({ bookId: 'b' })).rejects.toBeInstanceOf(UnavailableError);
  });
});

describe('the passage library with a server library behind it', () => {
  const bundled = libraryPassage('walden-woods', 'walden', 'Walden', 'Henry David Thoreau');
  const makeService = () => new BookService(new BrowserBookRepository([bundled]), real);

  it('lists only the bundled passages, as before', async () => {
    const library = await makeService().openLibrary();
    expect(library.summaries.map(s => s.id)).toEqual(['walden-woods']);
  });

  it('still reaches an excerpt that it does not list, by its id', async () => {
    const library = await makeService().openLibrary();
    expect(library.get('pg174-0002')).toBeUndefined();
    const [got] = await library.ensure(['pg174-0002']);
    expect(got.sourceText).toBe(excerptsOf('dorianGray')[1].sourceText);
    expect(library.get('pg174-0002')).toBe(got);
  });

  it('reaches bundled and server excerpts together, and skips one that nobody has', async () => {
    const library = await makeService().openLibrary();
    const got = await library.ensure(['walden-woods', 'pg174-0001', 'pg174-9999', 'nobody']);
    expect(got.map(p => p.id)).toEqual(['walden-woods', 'pg174-0001']);
  });

  it('fetches an excerpt once, however many ask', async () => {
    const fetcher = vi.fn(inProcessFetch({} as PoemsApi, createLibraryApi({ db })));
    const service = new BookService(new BrowserBookRepository([bundled]), new HttpBookRepository({ fetch: fetcher as typeof fetch }));
    const library = await service.openLibrary();
    await Promise.all([library.ensure(['pg174-0004']), library.ensure(['pg174-0004'])]);
    await library.ensure(['pg174-0004']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not fetch anything for the bundled passages from the server', async () => {
    const fetcher = vi.fn(inProcessFetch({} as PoemsApi, createLibraryApi({ db })));
    const service = new BookService(new BrowserBookRepository([bundled]), new HttpBookRepository({ fetch: fetcher as typeof fetch }));
    await (await service.openLibrary()).ensure(['walden-woods']);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('says so when the server cannot be reached for an excerpt, and tries again next time', async () => {
    let down = true;
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => (down ? Promise.reject(new TypeError('failed')) : inProcessFetch({} as PoemsApi, createLibraryApi({ db }))(input, init))) as typeof fetch;
    const library = await new BookService(new BrowserBookRepository([bundled]), new HttpBookRepository({ fetch: flaky })).openLibrary();
    await expect(library.ensure(['pg174-0001'])).rejects.toBeInstanceOf(UnavailableError);
    down = false;
    expect((await library.ensure(['pg174-0001']))[0].id).toBe('pg174-0001');
  });

  it('is closed to ids it does not list when there is no server library, as before', async () => {
    const library = await new BookService(new BrowserBookRepository([bundled])).openLibrary();
    expect(await library.ensure(['pg174-0001'])).toEqual([]);
  });

  it('searches the server’s books through the service, and finds none without a server library', async () => {
    const service = makeService();
    expect(service.hasRemoteLibrary).toBe(true);
    expect((await service.searchBooks({ search: 'wilde' })).items.map(b => b.id)).toEqual(['pg174']);
    expect((await service.listBookPassages('pg174', { limit: 2 })).items.map(p => p.id)).toEqual(['pg174-0001', 'pg174-0002']);
    expect((await service.getRemoteBook('pg174'))?.title).toBe('The Picture of Dorian Gray');
    const alone = new BookService(new BrowserBookRepository([bundled]));
    expect(alone.hasRemoteLibrary).toBe(false);
    expect(await alone.searchBooks({ search: 'wilde' })).toEqual({ items: [], next: null });
    expect(await alone.listBookPassages('pg174')).toEqual({ items: [], next: null });
    expect(await alone.getRemoteBook('pg174')).toBeNull();
  });

  it('opens a poem made from a server excerpt exactly as it was made', async () => {
    const library = await makeService().openLibrary();
    const [passage] = await library.ensure(['pg174-0003']);
    const words = passage.tokens.filter(t => t.isSelectable);
    const kept = words.slice(5, 12).map(t => t.id);
    const poem = { id: 'p', schemaVersion: 2, revision: 1, passageId: passage.id, retainedTokenIds: kept, lineBreaks: [kept[3]], erasureStyle: 'blackout' as const, createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' };
    const reopened = reopenPoem(poem, passage);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.snapshot.retainedTokenIds).toEqual(kept);
  });
});
