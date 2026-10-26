import { describe, it, expect, afterAll, vi } from 'vitest';
import { LIMITS, type Poem } from '@/lib/models';
import { PostgresPoemRepository } from '@/lib/server/PostgresPoemRepository';
import { createPoemsApi } from '@/lib/server/api/handlers';
import { supabaseAuthenticator, testAuthenticator } from '@/lib/server/api/auth';
import { readServerConfig } from '@/lib/server/api/config';
import { createTestDb } from '../helpers/pgliteDb';
import { draftOf, poem } from '../contract/poemRepositoryContract';

// The poems API, run as plain functions on real SQL: who may ask, what is accepted, what comes back,
// and what is said when something goes wrong.

const db = await createTestDb();
afterAll(() => db.close());

const api = createPoemsApi({ authenticate: testAuthenticator(), poemsOf: userId => new PostgresPoemRepository(db, userId) });

const newUser = () => crypto.randomUUID();
const asUser = (id: string) => ({ Authorization: `Bearer test-user:${id}` });

interface Call {
  user?: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  json?: boolean;
}

function request(method: string, path: string, { user, headers = {}, body, rawBody, json = true }: Call = {}) {
  const all: Record<string, string> = { ...(user ? asUser(user) : {}), ...headers };
  let text: string | undefined = rawBody;
  if (text === undefined && body !== undefined) text = JSON.stringify(body);
  if (text !== undefined && json && !('Content-Type' in all)) all['Content-Type'] = 'application/json';
  return new Request(`http://localhost${path}`, { method, headers: all, body: text });
}

const readError = async (response: Response) => ((await response.json()) as { error: { code: string; message: string; current?: Poem } }).error;
const draft = (overrides: Record<string, unknown> = {}) => ({ ...draftOf(poem('x')), ...overrides });

async function createFor(user: string, overrides: Record<string, unknown> = {}): Promise<Poem> {
  const response = await api.create(request('POST', '/api/poems', { user, body: draft(overrides) }));
  expect(response.status).toBe(201);
  return (await response.json()) as Poem;
}

describe('who is asking', () => {
  const endpoints: [string, () => Promise<Response>][] = [
    ['list', () => api.list(request('GET', '/api/poems', { body: undefined }))],
    ['create', () => api.create(request('POST', '/api/poems', { body: draft() }))],
    ['get', () => api.get(request('GET', '/api/poems/x'), 'x')],
    ['update', () => api.update(request('PUT', '/api/poems/x', { headers: { 'If-Match': '1' }, body: draft() }), 'x')],
    ['remove', () => api.remove(request('DELETE', '/api/poems/x'), 'x')],
    ['count', () => api.count(request('GET', '/api/collection/count'))],
    ['lookup', () => api.lookup(request('POST', '/api/collection/lookup', { body: { ids: ['x'] } }))],
    ['import', () => api.importPoems(request('POST', '/api/collection/import', { body: { poems: [] } }))],
  ];

  it.each(endpoints)('nothing is done by %s without a sign-in: 401, and a challenge', async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect((await readError(response)).code).toBe('unauthorized');
  });

  it.each([
    ['no scheme', 'test-user:' + newUser()],
    ['another scheme', 'Basic dGVzdDp0ZXN0'],
    ['a token that is not a user', 'Bearer nonsense'],
    ['a user that is not an id', 'Bearer test-user:not-a-uuid'],
    ['an empty token', 'Bearer '],
    ['an id with extra on the end', `Bearer test-user:${newUser()}x`],
  ])('is refused with %s', async (_label, header) => {
    const response = await api.list(request('GET', '/api/poems', { headers: { Authorization: header } }));
    expect(response.status).toBe(401);
  });

  it('is refused before the body is looked at: a bad body without a sign-in is a 401, not a 400', async () => {
    const response = await api.create(request('POST', '/api/poems', { rawBody: '{not json', headers: { 'Content-Type': 'text/plain' } }));
    expect(response.status).toBe(401);
  });

  it('accepts the scheme in any case', async () => {
    const user = newUser();
    const response = await api.count(request('GET', '/api/collection/count', { headers: { Authorization: `bearer test-user:${user}` } }));
    expect(response.status).toBe(200);
  });

  it('keeps one user’s poems from another, however they ask', async () => {
    const alice = newUser();
    const bob = newUser();
    const made = await createFor(alice, { title: 'Alice’s' });
    expect((await api.get(request('GET', `/api/poems/${made.id}`, { user: bob }), made.id)).status).toBe(404);
    expect((await api.update(request('PUT', `/api/poems/${made.id}`, { user: bob, headers: { 'If-Match': '1' }, body: draft() }), made.id)).status).toBe(404);
    expect((await api.remove(request('DELETE', `/api/poems/${made.id}`, { user: bob }), made.id)).status).toBe(204);
    expect(await (await api.count(request('GET', '/api/collection/count', { user: bob }))).json()).toEqual({ count: 0 });
    expect(await (await api.lookup(request('POST', '/api/collection/lookup', { user: bob, body: { ids: [made.id] } }))).json()).toEqual({ poems: [] });
    expect((await api.get(request('GET', `/api/poems/${made.id}`, { user: alice }), made.id)).status).toBe(200);
  });
});

describe('Supabase sign-in', () => {
  const user = newUser();
  const auth = (respond: () => Response | Promise<Response>) => {
    const fetcher = vi.fn(async () => respond());
    return { fetcher, authenticate: supabaseAuthenticator({ url: 'https://abc.supabase.co', anonKey: 'anon-key', fetch: fetcher as unknown as typeof fetch }) };
  };
  const withToken = (token = 'a.b.c') => request('GET', '/x', { headers: { Authorization: `Bearer ${token}` } });

  it('asks Supabase who the token belongs to, with the token and the public key, and uses the id it gives', async () => {
    const { fetcher, authenticate } = auth(() => Response.json({ id: user, email: 'a@b.c' }));
    expect(await authenticate(withToken('the.token.here'))).toBe(user);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://abc.supabase.co/auth/v1/user');
    expect(init.headers).toEqual({ Authorization: 'Bearer the.token.here', apikey: 'anon-key' });
    expect(init.cache).toBe('no-store');
  });

  it('does not ask at all without a token', async () => {
    const { fetcher, authenticate } = auth(() => Response.json({ id: user }));
    await expect(authenticate(request('GET', '/x'))).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403])('turns away a token Supabase answers %i for', async status => {
    const { authenticate } = auth(() => new Response('no', { status }));
    await expect(authenticate(withToken())).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('says the server is unavailable, not that the user is signed out, when Supabase fails or cannot be reached', async () => {
    await expect(auth(() => new Response('', { status: 500 })).authenticate(withToken())).rejects.toMatchObject({ code: 'unavailable' });
    await expect(auth(() => new Response('', { status: 429 })).authenticate(withToken())).rejects.toMatchObject({ code: 'unavailable' });
    await expect(auth(() => Promise.reject(new TypeError('fetch failed'))).authenticate(withToken())).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('trusts no answer that does not name a user by a proper id', async () => {
    for (const body of [{}, { id: 5 }, { id: 'not-a-uuid' }, { id: '' }, null, []]) {
      await expect(auth(() => Response.json(body)).authenticate(withToken())).rejects.toMatchObject({ code: 'unavailable' });
    }
    await expect(auth(() => new Response('not json')).authenticate(withToken())).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('the server’s settings', () => {
  const good = { DATABASE_URL: 'postgres://u:p@h/db', SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'k' };

  it('are read, with the Supabase address reduced to its origin', () => {
    expect(readServerConfig({ ...good, SUPABASE_URL: 'https://abc.supabase.co/some/path/' })).toEqual({
      databaseUrl: 'postgres://u:p@h/db',
      supabase: { url: 'https://abc.supabase.co', anonKey: 'k' },
      testAuth: false,
    });
  });

  it.each([
    ['no database', { ...good, DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['a blank database', { ...good, DATABASE_URL: '  ' }, 'DATABASE_URL'],
    ['no Supabase address', { ...good, SUPABASE_URL: undefined }, 'SUPABASE_URL'],
    ['no Supabase key', { ...good, SUPABASE_ANON_KEY: undefined }, 'SUPABASE_URL'],
    ['an address that is not one', { ...good, SUPABASE_URL: 'abc' }, 'not a valid address'],
    ['a plain http address that is not this computer', { ...good, SUPABASE_URL: 'http://abc.supabase.co' }, 'not a valid address'],
  ])('are refused: %s', (_label, env, mention) => {
    expect(() => readServerConfig(env)).toThrow();
    try {
      readServerConfig(env);
    } catch (error) {
      expect(error).toMatchObject({ code: 'unavailable', message: 'The server is not set up yet.' });
      expect((error as { problem: string }).problem).toContain(mention);
    }
  });

  it('allow plain http for this computer', () => {
    expect(readServerConfig({ ...good, SUPABASE_URL: 'http://localhost:54321' }).supabase?.url).toBe('http://localhost:54321');
  });

  it('allow the test sign-in outside production, with no Supabase settings', () => {
    expect(readServerConfig({ DATABASE_URL: 'postgres://x', PALIMPSEST_TEST_AUTH: '1', NODE_ENV: 'development' })).toEqual({ databaseUrl: 'postgres://x', supabase: null, testAuth: true });
  });

  it('never allow the test sign-in in production, whatever else is set', () => {
    expect(() => readServerConfig({ ...good, PALIMPSEST_TEST_AUTH: '1', NODE_ENV: 'production' })).toThrow('The server is not set up yet.');
  });

  it('do not turn the test sign-in on for any value but 1', () => {
    expect(readServerConfig({ ...good, PALIMPSEST_TEST_AUTH: 'true' }).testAuth).toBe(false);
  });
});

describe('saving a poem', () => {
  const user = newUser();

  it('stores it and gives it back with an id, the times and revision 1 that the server made', async () => {
    const made = await createFor(user, { title: 'Mine', notes: 'private' });
    expect(made).toMatchObject({ title: 'Mine', notes: 'private', revision: 1, schemaVersion: 2 });
    expect(made.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(made.createdAt).toBe(made.updatedAt);
    const got = await api.get(request('GET', `/api/poems/${made.id}`, { user }), made.id);
    expect(await got.json()).toEqual(made);
  });

  it('ignores an id, times or revision in the request: the server decides them', async () => {
    const made = await createFor(user, { id: 'chosen', revision: 99, schemaVersion: 7, createdAt: '2001-01-01T00:00:00.000Z', updatedAt: '2001-01-01T00:00:00.000Z', userId: 'someone-else', extra: 'dropped' });
    expect(made.id).not.toBe('chosen');
    expect(made).toMatchObject({ revision: 1, schemaVersion: 2 });
    expect(made.createdAt).not.toBe('2001-01-01T00:00:00.000Z');
    expect('extra' in made || 'userId' in made).toBe(false);
  });

  it('is never cached', async () => {
    const response = await api.create(request('POST', '/api/poems', { user, body: draft() }));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await api.get(request('GET', '/api/poems/nope', { user }), 'nope')).headers.get('cache-control')).toBe('no-store');
  });
});

describe('saving over a poem', () => {
  const user = newUser();
  const put = (id: string, headers: Record<string, string>, body: unknown = draft({ title: 'Changed' })) =>
    api.update(request('PUT', `/api/poems/${id}`, { user, headers, body }), id);

  it('needs the revision it started from, and says what was wrong when it does not have it', async () => {
    const made = await createFor(user);
    const missing = await put(made.id, {});
    expect(missing.status).toBe(428);
    expect((await readError(missing)).code).toBe('invalid');
    for (const header of ['abc', '0', '-1', '1.5', '1 2', '"1', '99999999999']) expect((await put(made.id, { 'If-Match': header })).status).toBe(400);
    expect((await api.get(request('GET', '/x', { user }), made.id).then(r => r.json())) as Poem).toMatchObject({ revision: 1, title: 'Poem x' });
  });

  it('saves from the right revision, in any of the usual ways of writing it, and counts up', async () => {
    let current = await createFor(user);
    for (const header of ['1', '"2"', 'W/"3"', ' 4 ']) {
      const response = await put(current.id, { 'If-Match': header }, draft({ title: `T${header}` }));
      expect(response.status).toBe(200);
      const next = (await response.json()) as Poem;
      expect(next.revision).toBe(current.revision + 1);
      expect(next).toMatchObject({ id: current.id, createdAt: current.createdAt });
      current = next;
    }
  });

  it('is refused as a conflict from a revision that is out of date, with the poem as it is now, and changes nothing', async () => {
    const made = await createFor(user);
    await put(made.id, { 'If-Match': '1' }, draft({ title: 'Theirs' }));
    const response = await put(made.id, { 'If-Match': '1' }, draft({ title: 'Mine' }));
    expect(response.status).toBe(409);
    const error = await readError(response);
    expect(error.code).toBe('conflict');
    expect(error.message).toContain('changed somewhere else');
    expect(error.current).toMatchObject({ title: 'Theirs', revision: 2 });
  });

  it('says the poem is gone when it is not there, and does not make it', async () => {
    const made = await createFor(user);
    await api.remove(request('DELETE', `/api/poems/${made.id}`, { user }), made.id);
    const response = await put(made.id, { 'If-Match': '1' });
    expect(response.status).toBe(404);
    expect((await readError(response)).code).toBe('gone');
    expect(await (await api.count(request('GET', '/x', { user: user }))).json()).toMatchObject({ count: expect.any(Number) });
    expect((await api.get(request('GET', '/x', { user }), made.id)).status).toBe(404);
  });

  it('treats an id that cannot be one of ours as a poem that is not there', async () => {
    for (const id of ['a b', 'x/y', '__proto__', '', 'a'.repeat(101), 'a;b']) {
      expect((await put(id, { 'If-Match': '1' })).status).toBe(404);
      expect((await api.get(request('GET', '/x', { user }), id)).status).toBe(404);
      expect((await api.remove(request('DELETE', '/x', { user }), id)).status).toBe(204);
    }
  });
});

describe('deleting a poem', () => {
  it('answers 204 whether or not it was there, and the poem is gone', async () => {
    const user = newUser();
    const made = await createFor(user);
    const first = await api.remove(request('DELETE', '/x', { user }), made.id);
    expect(first.status).toBe(204);
    expect(await first.text()).toBe('');
    expect((await api.remove(request('DELETE', '/x', { user }), made.id)).status).toBe(204);
    expect((await api.get(request('GET', '/x', { user }), made.id)).status).toBe(404);
  });
});

describe('listing', () => {
  it('gives summaries by default and whole poems for full=1, a page at a time, the newest change first', async () => {
    const user = newUser();
    const first = await createFor(user, { title: 'First' });
    await new Promise(r => setTimeout(r, 5));
    const second = await createFor(user, { title: 'Second', notes: 'secret' });

    const summaries = (await (await api.list(request('GET', '/api/poems', { user }))).json()) as { items: Record<string, unknown>[]; next: string | null };
    expect(summaries.items.map(s => s.id)).toEqual([second.id, first.id]);
    expect(summaries.next).toBeNull();
    expect(JSON.stringify(summaries)).not.toContain('secret');
    expect('retainedTokenIds' in summaries.items[0]).toBe(false);

    const full = (await (await api.list(request('GET', '/api/poems?full=1', { user }))).json()) as { items: Poem[] };
    expect(full.items[0]).toMatchObject({ id: second.id, notes: 'secret' });
  });

  it('pages with after and limit, and walks to the end', async () => {
    const user = newUser();
    for (let i = 0; i < 5; i++) {
      await createFor(user, { title: `P${i}` });
      await new Promise(r => setTimeout(r, 2));
    }
    const seen: string[] = [];
    let after: string | null = null;
    do {
      const url: string = `/api/poems?limit=2${after ? `&after=${encodeURIComponent(after)}` : ''}`;
      const page = (await (await api.list(request('GET', url, { user }))).json()) as { items: { title: string }[]; next: string | null };
      seen.push(...page.items.map(s => s.title));
      after = page.next;
    } while (after);
    expect(seen).toEqual(['P4', 'P3', 'P2', 'P1', 'P0']);
  });

  it('takes a limit that is not a number, or a cursor that is nonsense, in its stride', async () => {
    const user = newUser();
    await createFor(user);
    const odd = (await (await api.list(request('GET', '/api/poems?limit=abc', { user }))).json()) as { items: unknown[] };
    expect(odd.items).toHaveLength(1);
    const nonsense = await api.list(request('GET', '/api/poems?after=nonsense', { user }));
    expect(nonsense.status).toBe(200);
    expect(await nonsense.json()).toEqual({ items: [], next: null });
  });
});

describe('counting and looking up', () => {
  it('counts, and gives the poems asked for, whole, in the order asked, skipping what is not there', async () => {
    const user = newUser();
    const a = await createFor(user, { title: 'A' });
    const b = await createFor(user, { title: 'B' });
    expect(await (await api.count(request('GET', '/x', { user }))).json()).toEqual({ count: 2 });
    const found = (await (await api.lookup(request('POST', '/x', { user, body: { ids: [b.id, 'missing', a.id] } }))).json()) as { poems: Poem[] };
    expect(found.poems.map(p => p.title)).toEqual(['B', 'A']);
  });

  it('refuses ids that are not ids, or too many', async () => {
    const user = newUser();
    for (const body of [{}, { ids: 'a' }, { ids: [1] }, { ids: ['a b'] }, { ids: ['x'.repeat(101)] }, { ids: Array.from({ length: LIMITS.poemsMax + 1 }, (_, i) => `i${i}`) }]) {
      expect((await api.lookup(request('POST', '/x', { user, body }))).status).toBe(400);
    }
  });
});

describe('importing poems (restoring a backup)', () => {
  const stored = (id: string, overrides: Partial<Poem> = {}) => poem(id, { passageId: 'walden-woods', ...overrides });
  const post = (user: string, body: unknown) => api.importPoems(request('POST', '/api/collection/import', { user, body }));

  it('adds the poems exactly as they are, ids, times and revisions kept', async () => {
    const user = newUser();
    const response = await post(user, { poems: [stored('a', { revision: 4 }), stored('b')] });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ added: 2 });
    const got = (await (await api.get(request('GET', '/x', { user }), 'a')).json()) as Poem;
    expect(got).toEqual(stored('a', { revision: 4 }));
  });

  it('refuses an id that is already there with a 409, and adds none of them', async () => {
    const user = newUser();
    await post(user, { poems: [stored('a')] });
    const response = await post(user, { poems: [stored('b'), stored('a')] });
    expect(response.status).toBe(409);
    expect((await readError(response)).code).toBe('exists');
    expect(await (await api.count(request('GET', '/x', { user }))).json()).toEqual({ count: 1 });
  });

  it.each([
    ['not a list', { poems: 'a' }],
    ['no list', {}],
    ['a poem that is not one', { poems: [stored('a'), { id: 'b' }] }],
    ['a poem of the first version', { poems: [{ ...stored('a'), schemaVersion: 1 }] }],
    ['an id that is not allowed', { poems: [stored('a b')] }],
    ['the id __proto__', { poems: [stored('__proto__')] }],
    ['the same id twice', { poems: [stored('a'), stored('a')] }],
    ['a line break after a word that is not kept', { poems: [stored('a', { lineBreaks: ['nope'] })] }],
    ['a NUL character', { poems: [stored('a', { notes: 'a\u0000b' })] }],
  ])('refuses %s with a 400, and adds none', async (_label, body) => {
    const user = newUser();
    const response = await post(user, body);
    expect(response.status).toBe(400);
    expect(await (await api.count(request('GET', '/x', { user }))).json()).toEqual({ count: 0 });
  });

  it('cuts a title that is longer than the limit, as saving always did, and refuses notes that are', async () => {
    const user = newUser();
    expect((await post(user, { poems: [stored('long', { title: 'T'.repeat(300) })] })).status).toBe(201);
    expect(((await (await api.get(request('GET', '/x', { user }), 'long')).json()) as Poem).title).toHaveLength(LIMITS.titleMax);
    const notes = await post(user, { poems: [stored('notes', { notes: 'n'.repeat(LIMITS.notesMax + 1) })] });
    expect(notes.status).toBe(422);
  });

  it('refuses more poems than a collection can hold, in the request or with what is already there', async () => {
    const user = newUser();
    const big = await post(user, { poems: Array.from({ length: LIMITS.poemsMax + 1 }, (_, i) => stored(`p${i}`)) });
    expect(big.status).toBe(422);
    expect((await post(user, { poems: Array.from({ length: LIMITS.poemsMax }, (_, i) => stored(`p${i}`)) })).status).toBe(201);
    const more = await post(user, { poems: [stored('one-more')] });
    expect(more.status).toBe(422);
    expect((await readError(more)).message).toContain('Your collection is full');
  });
});

describe('what is refused in a poem being saved', () => {
  const user = newUser();
  const attempt = (overrides: Record<string, unknown>) => api.create(request('POST', '/api/poems', { user, body: draft(overrides) }));

  it.each([
    ['a passage that is not an id', { passageId: 'a b' }, 400],
    ['no passage', { passageId: undefined }, 400],
    ['an erasure style that is not one', { erasureStyle: 'sparkle' }, 400],
    ['kept words that are not a list', { retainedTokenIds: 'a' }, 400],
    ['a kept word that is not text', { retainedTokenIds: [1] }, 400],
    ['an empty kept word', { retainedTokenIds: [''] }, 400],
    ['a kept word that is too long', { retainedTokenIds: ['x'.repeat(201)], lineBreaks: [] }, 400],
    ['a line break after a word that is not kept', { lineBreaks: ['nope'] }, 400],
    ['a title that is not text', { title: 5 }, 400],
    ['notes that are not text', { notes: {} }, 400],
    ['a NUL character in the title', { title: 'a\u0000b' }, 400],
    ['a control character in the notes', { notes: 'a\u0007b' }, 400],
    ['a passage version that is not one', { passageVersion: 'abc' }, 400],
  ])('%s is a 400', async (_label, overrides, status) => {
    const response = await attempt(overrides);
    expect(response.status).toBe(status);
    expect((await readError(response)).code).toBe('invalid');
  });

  it.each([
    ['a title over the limit', { title: 'T'.repeat(LIMITS.titleMax + 1) }, `A title can be at most ${LIMITS.titleMax} characters.`],
    ['notes over the limit', { notes: 'n'.repeat(LIMITS.notesMax + 1) }, 'Notes can be at most 10,000 characters.'],
    ['more words than a poem can keep', { retainedTokenIds: Array.from({ length: LIMITS.retainedMax + 1 }, (_, i) => `w${i}`), lineBreaks: [] }, 'A poem can keep at most 10,000 words.'],
  ])('%s is a 422 with a message to show', async (_label, overrides, message) => {
    const response = await attempt(overrides);
    expect(response.status).toBe(422);
    expect(await readError(response)).toEqual({ code: 'limit', message });
  });

  it('accepts the most the limits allow', async () => {
    const words = Array.from({ length: LIMITS.retainedMax }, (_, i) => `w${i}`);
    const response = await attempt({ title: 'T'.repeat(LIMITS.titleMax), notes: 'n'.repeat(LIMITS.notesMax), retainedTokenIds: words, lineBreaks: [words[3]] });
    expect(response.status).toBe(201);
  });

  it('accepts tabs and line breaks in the notes', async () => {
    expect((await attempt({ notes: 'one\n\ttwo\r\nthree' })).status).toBe(201);
  });

  it('stores nothing of a poem it refuses', async () => {
    const fresh = newUser();
    await api.create(request('POST', '/api/poems', { user: fresh, body: draft({ erasureStyle: 'sparkle' }) }));
    expect(await (await api.count(request('GET', '/x', { user: fresh }))).json()).toEqual({ count: 0 });
  });
});

describe('what is refused in a request', () => {
  const user = newUser();

  it('wants JSON: any other content type is a 415', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      const response = await api.create(request('POST', '/api/poems', { user, headers: { 'Content-Type': type }, rawBody: JSON.stringify(draft()) }));
      expect(response.status).toBe(415);
    }
    const none = await api.create(new Request('http://localhost/api/poems', { method: 'POST', headers: asUser(user), body: JSON.stringify(draft()) }));
    expect(none.status).toBe(415); // a string body defaults to text/plain
  });

  it('refuses a body that is not JSON, 400, without echoing it', async () => {
    const response = await api.create(request('POST', '/api/poems', { user, rawBody: '{"title": "secret-text" oops' }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain('secret-text');
  });

  it('refuses a body that is too large, 413, by what it says and by what it is', async () => {
    const declared = await api.create(request('POST', '/api/poems', { user, headers: { 'Content-Length': String(50 * 1024 * 1024) }, rawBody: '{}' }));
    expect(declared.status).toBe(413);
    const actual = await api.create(request('POST', '/api/poems', { user, rawBody: JSON.stringify({ notes: 'x'.repeat(2 * 1024 * 1024) }) }));
    expect(actual.status).toBe(413);
    expect((await api.importPoems(request('POST', '/api/collection/import', { user, rawBody: JSON.stringify({ poems: [], pad: 'x'.repeat(LIMITS.backupBytesMax) }) }))).status).toBe(413);
  });

  it.each([['null', 'null'], ['a list', '[]'], ['a number', '5'], ['a string', '"x"']])('refuses a body that is %s, 400', async (_label, rawBody) => {
    expect((await api.create(request('POST', '/api/poems', { user, rawBody }))).status).toBe(400);
  });
});

describe('when something goes wrong on the server', () => {
  it('says the server is unavailable, 503, and shows nothing of the cause', async () => {
    const test = await createTestDb();
    const failing = createPoemsApi({ authenticate: testAuthenticator(), poemsOf: userId => new PostgresPoemRepository(test, userId) });
    test.failWrites();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await failing.count(request('GET', '/x', { user: newUser() }));
    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).toContain('unavailable');
    expect(body).not.toContain('connection lost');
    expect(quiet).toHaveBeenCalled(); // it is logged on the server
    quiet.mockRestore();
    await test.close();
  });

  it('says 500, and nothing of the cause, for a failure nobody expected', async () => {
    const broken = createPoemsApi({
      authenticate: testAuthenticator(),
      poemsOf: () => {
        throw new Error('internal detail: password=hunter2');
      },
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await broken.count(request('GET', '/x', { user: newUser() }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('hunter2');
    quiet.mockRestore();
  });

  it('does not let a failure to sign in look like a failure of the poems', async () => {
    const down = createPoemsApi({
      authenticate: supabaseAuthenticator({ url: 'https://abc.supabase.co', anonKey: 'k', fetch: (async () => new Response('', { status: 502 })) as typeof fetch }),
      poemsOf: userId => new PostgresPoemRepository(db, userId),
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await down.count(request('GET', '/x', { headers: { Authorization: 'Bearer some.token.value' } }));
    expect(response.status).toBe(503);
    quiet.mockRestore();
  });
});

describe('the collection limit through the API', () => {
  it('refuses a new poem in a full collection with the message to show, 422, and keeps the others', async () => {
    const user = newUser();
    const repo = new PostgresPoemRepository(db, user);
    await repo.importMany(Array.from({ length: LIMITS.poemsMax }, (_, i) => poem(`p${i}`)));
    const response = await api.create(request('POST', '/api/poems', { user, body: draft() }));
    expect(response.status).toBe(422);
    expect(await readError(response)).toEqual({ code: 'limit', message: 'Your collection is full: it can hold up to 2,000 poems. Delete some to save more.' });
    expect(await repo.count()).toBe(LIMITS.poemsMax);
  });
});
