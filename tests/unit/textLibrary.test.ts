// @vitest-environment node
import { describe, it, expect, afterAll, vi } from 'vitest';
import { HttpTextRepository } from '@/lib/repositories/http/HttpTextRepository';
import { PostgresTextRepository } from '@/lib/server/PostgresTextRepository';
import { createTextsApi } from '@/lib/server/api/texts';
import { testAuthenticator } from '@/lib/server/api/auth';
import { TextLibrary } from '@/lib/userTexts/TextLibrary';
import { MemoryTextStorage, USER_TEXT_LIMITS, UserTextError, UserTexts } from '@/lib/userTexts/UserTexts';
import { createTestDb } from '../helpers/pgliteDb';

// The reader's texts across browsers: the real library over the real API on real SQL, with a "browser" being a
// storage of its own and a signed-in user being a token.

const db = await createTestDb();
afterAll(() => db.close());

const texts = createTextsApi({ authenticate: testAuthenticator(), textsOf: userId => new PostgresTextRepository(db, userId) });

const newUser = () => crypto.randomUUID();

interface Network {
  offline: boolean;
  /** Statuses to answer the next requests with instead of the API. */
  fail: number[];
  requests: string[];
}

function makeFetch(network: Network): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    network.requests.push(`${init?.method ?? 'GET'} ${url}`);
    if (network.offline) throw new TypeError('network down');
    const status = network.fail.shift();
    if (status) return Response.json({ error: { code: 'x', message: 'words from the server' } }, { status });
    const request = new Request(new URL(url, 'http://localhost'), init);
    const { pathname } = new URL(request.url);
    if (pathname === '/api/texts') return request.method === 'GET' ? texts.list(request) : texts.create(request);
    const id = decodeURIComponent(pathname.split('/').pop()!);
    return request.method === 'PUT' ? texts.update(request, id) : texts.remove(request, id);
  }) as typeof fetch;
}

/** One browser: its own storage, and whoever is signed in there. */
function browser(initial: { user?: string | null } = {}) {
  const storage = new MemoryTextStorage();
  const network: Network = { offline: false, fail: [], requests: [] };
  const state = { user: initial.user ?? null as string | null };
  const remote = new HttpTextRepository({
    session: { getToken: async () => (state.user ? `test-user:${state.user}` : null) },
    fetch: makeFetch(network),
  });
  const local = new UserTexts(storage);
  const library = new TextLibrary({ local, remote, storage, whoIsSignedIn: async () => state.user });
  /** The same browser after the page is loaded again: the same storage, a new library. */
  const reload = () => new TextLibrary({ local: new UserTexts(storage), remote, storage, whoIsSignedIn: async () => state.user });
  return { storage, network, state, local, library, reload };
}

const input = (title: string, text = `${title}: the garden is quiet today.`) => ({ title, author: 'Me', form: 'prose' as const, text });
const titles = async (library: TextLibrary) => (await library.list(true)).map(t => t.title).sort();

describe('signed out', () => {
  it('keeps texts in this browser and asks the server for nothing', async () => {
    const b = browser();
    const added = await b.library.add(input('Local'));
    expect(await b.library.where()).toBe('browser');
    expect(await titles(b.library)).toEqual(['Local']);
    expect(b.local.get(added.id)?.title).toBe('Local');
    expect(b.network.requests).toEqual([]);
  });

  it('has no account at all when the app has none (the texts stay in the browser even with a user)', async () => {
    const storage = new MemoryTextStorage();
    const library = new TextLibrary({ local: new UserTexts(storage), remote: null, storage, whoIsSignedIn: async () => newUser() });
    await library.add(input('Local'));
    expect(await library.where()).toBe('browser');
    expect(await titles(library)).toEqual(['Local']);
  });
});

describe('signed in: the texts follow the reader', () => {
  it('a text added in one browser is there in another browser the same user signs in on', async () => {
    const user = newUser();
    const one = browser({ user });
    const added = await one.library.add(input('Follows me', 'First part.\n\nSecond part.'));
    expect(await one.library.where()).toBe('account');
    expect(one.local.list()).toEqual([]); // nothing was kept in the first browser

    const two = browser({ user });
    const there = await two.library.list();
    expect(there.map(t => [t.id, t.title, t.text])).toEqual([[added.id, 'Follows me', 'First part.\n\nSecond part.']]);
    // ...and it is a book there, with the excerpts and ids it had.
    const passages = await two.library.listPassageSummaries({ bookId: added.id });
    const first = await two.library.getPassage(passages.items[0].id);
    expect(first?.sourceText).toContain('First part.');
    expect((await two.library.listBooks()).items.map(book => book.title)).toEqual(['Follows me']);
  });

  it('another user does not see it', async () => {
    const owner = browser({ user: newUser() });
    await owner.library.add(input('Private'));
    const other = browser({ user: newUser() });
    expect(await other.library.list()).toEqual([]);
  });

  it('a change and a deletion in one browser show in the other', async () => {
    const user = newUser();
    const one = browser({ user });
    const two = browser({ user });
    const a = await one.library.add(input('Old title'));
    const b = await one.library.add(input('Doomed'));
    expect(await titles(two.library)).toEqual(['Doomed', 'Old title']);
    await one.library.update(a.id, input('New title', 'New words.'));
    await one.library.remove(b.id);
    expect((await two.library.list(true)).map(t => [t.title, t.text])).toEqual([['New title', 'New words.']]);
  });

  it('a list fetched a moment ago is not fetched again, but a fresh one is when asked, and after a change here', async () => {
    const b = browser({ user: newUser() });
    await b.library.add(input('One'));
    await b.library.list(true);
    const before = b.network.requests.length;
    await b.library.list();
    await b.library.listBooks();
    expect(b.network.requests.length).toBe(before);
    await b.library.list(true);
    expect(b.network.requests.length).toBe(before + 1);
    await b.library.add(input('Two'));
    expect((await b.library.list()).map(t => t.title).sort()).toEqual(['One', 'Two']); // not the list fetched before the change
    const [one] = (await b.library.list()).filter(t => t.title === 'One');
    await b.library.update(one.id, input('One, changed'));
    expect((await b.library.list()).map(t => t.title).sort()).toEqual(['One, changed', 'Two']);
    await b.library.remove(one.id);
    expect((await b.library.list()).map(t => t.title)).toEqual(['Two']);
  });

  it('signing out shows this browser’s own texts again, and signing in as someone else shows theirs', async () => {
    const b = browser({ user: newUser() });
    await b.library.add(input('In the account'));
    b.state.user = null;
    expect(await b.library.where()).toBe('browser');
    expect(await b.library.list()).toEqual([]);
    b.state.user = newUser();
    expect(await b.library.list()).toEqual([]);
  });
});

describe('copying the texts of this browser to the account', () => {
  it('copies each text once, with its id and times, on the first sign-in, and leaves this browser’s copies', async () => {
    const b = browser();
    const first = await b.library.add(input('From before'));
    const second = await b.library.add(input('Also from before'));
    const user = newUser();
    b.state.user = user;

    const library = b.reload();
    expect(await titles(library)).toEqual(['Also from before', 'From before']);
    const copied = (await library.list(true)).find(t => t.id === first.id)!;
    expect(copied.createdAt).toBe(first.createdAt);
    expect(copied.updatedAt).toBe(first.updatedAt);
    expect(b.local.list().map(t => t.id).sort()).toEqual([first.id, second.id].sort());
    // Another browser of the same user has them without having copied anything.
    expect(await titles(browser({ user }).library)).toEqual(['Also from before', 'From before']);
  });

  it('tells what was copied once, and not again', async () => {
    const b = browser();
    await b.library.add(input('One'));
    await b.library.add(input('Two'));
    b.state.user = newUser();
    const library = b.reload();
    await library.list();
    expect(await library.takeCopyReport()).toEqual({ copied: 2, skipped: [] });
    expect(await library.takeCopyReport()).toBeNull();
    expect(await b.reload().takeCopyReport()).toBeNull();
  });

  it('copies nothing twice: a text deleted from the account does not come back from this browser', async () => {
    const b = browser();
    const kept = await b.library.add(input('Keep'));
    const doomed = await b.library.add(input('Delete me'));
    b.state.user = newUser();
    let library = b.reload();
    await library.list();
    await library.remove(doomed.id);
    library = b.reload(); // a new page load
    expect(await titles(library)).toEqual(['Keep']);
    expect(b.local.get(doomed.id)).not.toBeNull(); // still in this browser...
    expect((await library.list(true)).map(t => t.id)).toEqual([kept.id]); // ...but not resurrected
  });

  it('a text added here while signed out is copied the next time the reader signs in', async () => {
    const user = newUser();
    const b = browser();
    await b.library.add(input('Before'));
    b.state.user = user;
    await b.reload().list();
    b.state.user = null;
    await b.library.add(input('Added while signed out'));
    b.state.user = user;
    expect(await titles(b.reload())).toEqual(['Added while signed out', 'Before']);
  });

  it('is done once for each page load however many things ask', async () => {
    const b = browser();
    await b.library.add(input('One'));
    b.state.user = newUser();
    const library = b.reload();
    await Promise.all([library.list(), library.listBooks(), library.list(true), library.getPassage('my-aaaaaaaa-zz')]);
    expect(b.network.requests.filter(r => r.startsWith('POST')).length).toBe(1);
  });

  it('a text the account already has (copied by another browser) is not an error and not a duplicate', async () => {
    const user = newUser();
    const b = browser();
    const added = await b.library.add(input('Shared id'));
    b.state.user = user;
    await b.reload().list(); // copied
    const other = browser();
    other.local.add(input('Other browser'));
    // The same text, with the same id, is also in a second browser's storage:
    other.storage.setItem('palimpsest:user-texts:v1', b.storage.getItem('palimpsest:user-texts:v1')!);
    other.state.user = user;
    const library = other.reload();
    const list = await library.list();
    expect(list.filter(t => t.id === added.id)).toHaveLength(1);
    expect(await library.takeCopyReport()).toBeNull(); // nothing new was copied, so nothing is said
  });

  it('does not mark texts as copied when the account could not be reached, and tries again at the next page load', async () => {
    const b = browser();
    await b.library.add(input('Waits'));
    b.state.user = newUser();
    b.network.offline = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(b.reload().list()).rejects.toBeDefined(); // the list cannot be fetched either
    b.network.offline = false;
    expect(await titles(b.reload())).toEqual(['Waits']);
    warn.mockRestore();
  });

  it('copies the texts that fit and tells which could not, when the account has no room', async () => {
    const b = browser();
    const wide = '字'.repeat(USER_TEXT_LIMITS.text - 10);
    // This browser can hold up to 2 million characters: three wide texts fit there but not in 3 MB of an account.
    for (const title of ['Wide one', 'Wide two', 'Wide three']) await b.library.add(input(title, `${title[title.length - 1]}${wide}`.replace(/./, title.length > 8 ? '二' : '一')));
    b.state.user = newUser();
    const library = b.reload();
    const kept = await library.list();
    expect(kept.length).toBeLessThan(3);
    const report = await library.takeCopyReport();
    expect(report?.copied).toBe(kept.length);
    expect(report?.skipped.length).toBe(3 - kept.length);
    expect(b.local.list()).toHaveLength(3);
  });
});

describe('changing texts in the account', () => {
  it('refuses what the browser refuses, with the same words, before asking the server', async () => {
    const b = browser({ user: newUser() });
    await expect(b.library.add({ ...input('x'), title: ' ' })).rejects.toThrow('Give the text a title.');
    expect(b.network.requests.filter(r => r.startsWith('POST') && !r.includes('copy'))).toEqual([]);
  });

  it('says it when the server will not take a text (over the room of the account)', async () => {
    const b = browser({ user: newUser() });
    const wide = '字'.repeat(USER_TEXT_LIMITS.text - 10);
    await b.library.add(input('Big one', wide));
    await b.library.add(input('Big two', `一${wide.slice(1)}`)).catch(() => undefined);
    await expect(b.library.add(input('Big three', `二${wide.slice(1)}`))).rejects.toThrow(/more room than your account keeps/);
  });

  it('a change to a text that was deleted somewhere else says so', async () => {
    const user = newUser();
    const one = browser({ user });
    const two = browser({ user });
    const added = await one.library.add(input('Gone soon'));
    await two.library.remove(added.id);
    const error = await one.library.update(added.id, input('Too late')).catch(e => e);
    expect(error).toBeInstanceOf(UserTextError);
    expect(error.message).toMatch(/deleted somewhere else/);
    expect(error.code).toBe('not-found');
  });

  it('when the server is down or the reader is not signed in, the reader is told in words, and nothing is kept in this browser instead', async () => {
    const b = browser({ user: newUser() });
    b.network.fail.push(503);
    const down = await b.library.add(input('Lost?')).catch(e => e);
    expect(down).toBeInstanceOf(UserTextError);
    expect(down.message).toMatch(/Please try again/);
    expect(b.local.list()).toEqual([]);
    b.network.offline = true;
    const offline = await b.library.remove('my-aaaaaaaa').catch(e => e);
    expect(offline).toBeInstanceOf(UserTextError);
  });

  it('is told to sign in again when the sign-in has run out', async () => {
    const b = browser({ user: newUser() });
    b.network.fail.push(401);
    const error = await b.library.add(input('Late')).catch(e => e);
    expect(error).toBeInstanceOf(UserTextError);
    expect(error.message).toMatch(/not signed in/);
  });
});
