import { describe, it, expect, afterAll } from 'vitest';
import { PostgresTextRepository } from '@/lib/server/PostgresTextRepository';
import { createTextsApi } from '@/lib/server/api/texts';
import { createAccountStore } from '@/lib/server/api/accounts';
import { testAuthenticator } from '@/lib/server/api/auth';
import { createDbRateLimiter } from '@/lib/server/api/rateLimit';
import { USER_TEXT_LIMITS } from '@/lib/userTexts/UserTexts';
import { createTestDb } from '../helpers/pgliteDb';

// The API for the readers' own texts, run as plain functions on real SQL: who may ask, what is accepted, whose
// texts come back, the limits, and what is said when something is wrong.

const db = await createTestDb();
afterAll(() => db.close());

const api = createTextsApi({ authenticate: testAuthenticator(), textsOf: userId => new PostgresTextRepository(db, userId) });

const newUser = () => crypto.randomUUID();
const asUser = (id: string) => ({ Authorization: `Bearer test-user:${id}` });
let counter = 0;
const newId = () => `my-${(++counter).toString(36).padStart(8, 'a')}`;

function request(method: string, path: string, { user, body, rawBody, headers = {} }: { user?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}) {
  const all: Record<string, string> = { ...(user ? asUser(user) : {}), ...headers };
  const text = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
  if (text !== undefined && !('Content-Type' in all)) all['Content-Type'] = 'application/json';
  return new Request(`http://localhost${path}`, { method, headers: all, body: text });
}

const content = (overrides: Record<string, unknown> = {}) => ({ title: 'A letter', author: 'Me', form: 'prose', text: 'Dear friend, the garden is quiet today.', ...overrides });
const error = async (response: Response) => ((await response.json()) as { error: { code: string; message: string } }).error;
const add = (user: string, overrides: Record<string, unknown> = {}) => api.create(request('POST', '/api/texts', { user, body: { id: newId(), ...content(), ...overrides } }));
const listOf = async (user: string) =>
  ((await (await api.list(request('GET', '/api/texts', { user }))).json()) as { texts: { id: string; title: string; text: string; createdAt: string; updatedAt: string }[] }).texts;

describe('who is asking', () => {
  const endpoints: [string, () => Promise<Response>][] = [
    ['list', () => api.list(request('GET', '/api/texts'))],
    ['create', () => api.create(request('POST', '/api/texts', { body: { id: newId(), ...content() } }))],
    ['update', () => api.update(request('PUT', '/api/texts/my-aaaaaaaa', { body: content() }), 'my-aaaaaaaa')],
    ['remove', () => api.remove(request('DELETE', '/api/texts/my-aaaaaaaa'), 'my-aaaaaaaa')],
  ];
  it.each(endpoints)('nothing is done by %s without a sign-in: 401', async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });
});

describe('adding, reading, changing and deleting', () => {
  it('adds a text with the id the browser made, and lists it whole', async () => {
    const user = newUser();
    const id = newId();
    const response = await api.create(request('POST', '/api/texts', { user, body: { id, ...content({ text: 'First line.\n\nSecond line.' }) } }));
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const stored = (await response.json()) as { id: string; text: string };
    expect(stored.id).toBe(id);
    expect(stored.text).toBe('First line.\n\nSecond line.');
    expect(await listOf(user)).toEqual([expect.objectContaining({ id, title: 'A letter', text: 'First line.\n\nSecond line.' })]);
  });

  it('shows a user only their own texts', async () => {
    const [a, b] = [newUser(), newUser()];
    await add(a, { title: 'Mine' });
    await add(b, { title: 'Theirs' });
    expect((await listOf(a)).map(t => t.title)).toEqual(['Mine']);
    expect((await listOf(b)).map(t => t.title)).toEqual(['Theirs']);
  });

  it('lists the text changed last first', async () => {
    const user = newUser();
    await add(user, { title: 'Old' });
    await new Promise(resolve => setTimeout(resolve, 5));
    await add(user, { title: 'Newer' });
    expect((await listOf(user)).map(t => t.title)).toEqual(['Newer', 'Old']);
    await new Promise(resolve => setTimeout(resolve, 5));
    const old = (await listOf(user)).find(t => t.title === 'Old')!;
    const response = await api.update(request('PUT', `/api/texts/${old.id}`, { user, body: content({ title: 'Old, changed' }) }), old.id);
    expect(response.status).toBe(200);
    expect((await listOf(user)).map(t => t.title)).toEqual(['Old, changed', 'Newer']);
  });

  it('adding a text whose id is taken is a 409 and changes nothing', async () => {
    const user = newUser();
    const id = newId();
    await api.create(request('POST', '/api/texts', { user, body: { id, ...content({ title: 'First' }) } }));
    const again = await api.create(request('POST', '/api/texts', { user, body: { id, ...content({ title: 'Second' }) } }));
    expect(again.status).toBe(409);
    expect((await error(again)).code).toBe('exists');
    expect((await listOf(user)).map(t => t.title)).toEqual(['First']);
  });

  it('the same id may be used by two users, each with their own text', async () => {
    const [a, b] = [newUser(), newUser()];
    const id = newId();
    expect((await api.create(request('POST', '/api/texts', { user: a, body: { id, ...content({ title: 'A' }) } }))).status).toBe(201);
    expect((await api.create(request('POST', '/api/texts', { user: b, body: { id, ...content({ title: 'B' }) } }))).status).toBe(201);
  });

  it('changing a text keeps the time it was made and moves the time of the change', async () => {
    const user = newUser();
    const id = newId();
    const past = '2026-01-02T03:04:05.000Z';
    await api.create(request('POST', '/api/texts', { user, body: { id, ...content(), createdAt: past, updatedAt: past } }));
    const changed = (await (await api.update(request('PUT', `/api/texts/${id}`, { user, body: content({ text: 'New words.' }) }), id)).json()) as {
      createdAt: string;
      updatedAt: string;
      text: string;
    };
    expect(changed.text).toBe('New words.');
    expect(changed.createdAt).toBe(past);
    expect(changed.updatedAt > changed.createdAt).toBe(true);
  });

  it('changing a text another user has, or one that is gone, is a 404', async () => {
    const [a, b] = [newUser(), newUser()];
    const id = newId();
    await api.create(request('POST', '/api/texts', { user: a, body: { id, ...content({ title: 'Mine' }) } }));
    const response = await api.update(request('PUT', `/api/texts/${id}`, { user: b, body: content({ title: 'Taken' }) }), id);
    expect(response.status).toBe(404);
    expect((await error(response)).code).toBe('gone');
    expect((await listOf(a)).map(t => t.title)).toEqual(['Mine']);
    expect((await api.update(request('PUT', '/api/texts/not-an-id', { user: a, body: content() }), 'not-an-id')).status).toBe(404);
  });

  it('deleting removes the text, only for its owner, and is 204 whether or not it was there', async () => {
    const [a, b] = [newUser(), newUser()];
    const id = newId();
    await api.create(request('POST', '/api/texts', { user: a, body: { id, ...content() } }));
    expect((await api.remove(request('DELETE', `/api/texts/${id}`, { user: b }), id)).status).toBe(204);
    expect(await listOf(a)).toHaveLength(1);
    expect((await api.remove(request('DELETE', `/api/texts/${id}`, { user: a }), id)).status).toBe(204);
    expect(await listOf(a)).toHaveLength(0);
    expect((await api.remove(request('DELETE', `/api/texts/${id}`, { user: a }), id)).status).toBe(204);
    expect((await api.remove(request('DELETE', '/api/texts/x', { user: a }), "';--")).status).toBe(204);
  });

  it('keeps the times of a text copied from a browser, but not a time in the future or one that is not a time', async () => {
    const user = newUser();
    const past = '2025-05-05T05:05:05.000Z';
    const first = (await (await api.create(request('POST', '/api/texts', { user, body: { id: newId(), ...content(), createdAt: past, updatedAt: past } }))).json()) as {
      createdAt: string;
    };
    expect(first.createdAt).toBe(past);
    const future = '2999-01-01T00:00:00.000Z';
    const second = (await (await api.create(request('POST', '/api/texts', { user, body: { id: newId(), ...content(), createdAt: future, updatedAt: future } }))).json()) as {
      createdAt: string;
    };
    expect(second.createdAt < future).toBe(true);
    const third = (await (await api.create(request('POST', '/api/texts', { user, body: { id: newId(), ...content(), createdAt: 'yesterday', updatedAt: 5 } }))).json()) as {
      createdAt: string;
    };
    expect(Number.isFinite(Date.parse(third.createdAt))).toBe(true);
  });
});

describe('what is refused', () => {
  const user = newUser();
  it.each([
    ['an id that is not one this app makes', { id: 'abc' }, 400],
    ['an id of an excerpt, not a text', { id: 'my-abcdefgh-1x' }, 400],
    ['an id that is not text', { id: 5 }, 400],
    ['no title', { title: '   ' }, 422],
    ['a title that is not text', { title: 5 }, 400],
    ['a title over the limit', { title: 'x'.repeat(USER_TEXT_LIMITS.title + 1) }, 422],
    ['an author over the limit', { author: 'x'.repeat(USER_TEXT_LIMITS.author + 1) }, 422],
    ['a form that is neither prose nor verse', { form: 'drama' }, 400],
    ['no words', { text: '  \n ' }, 422],
    ['words that are not text', { text: ['a'] }, 400],
    ['a character the database cannot keep', { text: 'a\u0000b' }, 422],
    ['words over the limit', { text: 'a '.repeat(USER_TEXT_LIMITS.text) }, 422],
  ])('%s', async (_what, overrides, status) => {
    const response = await add(user, overrides);
    expect(response.status).toBe(status);
    expect(typeof (await error(response)).message).toBe('string');
    expect(await listOf(user)).toHaveLength(0);
  });

  it('a body that is not JSON, not marked as JSON, or too large', async () => {
    expect((await api.create(request('POST', '/api/texts', { user, rawBody: '{nope' }))).status).toBe(400);
    expect((await api.create(request('POST', '/api/texts', { user, rawBody: '{}', headers: { 'Content-Type': 'text/plain' } }))).status).toBe(415);
    expect((await api.create(request('POST', '/api/texts', { user, rawBody: JSON.stringify({ id: newId(), ...content({ text: 'a'.repeat(4 * 1024 * 1024) }) }) }))).status).toBe(413);
    expect((await api.create(request('POST', '/api/texts', { user, body: [] }))).status).toBe(400);
  });

  it('changing a text with words over the limit leaves it as it was', async () => {
    const owner = newUser();
    const id = newId();
    await api.create(request('POST', '/api/texts', { user: owner, body: { id, ...content({ text: 'Keep these.' }) } }));
    const response = await api.update(request('PUT', `/api/texts/${id}`, { user: owner, body: content({ text: 'a '.repeat(USER_TEXT_LIMITS.text) }) }), id);
    expect(response.status).toBe(422);
    expect((await listOf(owner))[0].text).toBe('Keep these.');
  });
});

describe('the limits of an account', () => {
  it('keeps at most 30 texts, with a message, and a place is free again after a delete', async () => {
    const user = newUser();
    for (let i = 0; i < USER_TEXT_LIMITS.count; i++) expect((await add(user, { title: `T${i}` })).status).toBe(201);
    const over = await add(user);
    expect(over.status).toBe(422);
    expect((await error(over)).message).toMatch(/up to 30 texts/);
    const [first] = await listOf(user);
    await api.remove(request('DELETE', `/api/texts/${first.id}`, { user }), first.id);
    expect((await add(user)).status).toBe(201);
  });

  it('counts the room in bytes, so a text in a script of three-byte characters takes more room than its length', async () => {
    const user = newUser();
    const wide = '字'.repeat(USER_TEXT_LIMITS.text - 10); // about 1.8 MB
    expect((await add(user, { text: wide })).status).toBe(201);
    const second = await add(user, { text: `一${wide.slice(1)}` }); // another 1.8 MB: 3.6 MB in all, over 3 MB
    expect(second.status).toBe(422);
    expect((await add(user, { text: 'Small.' })).status).toBe(201);
  });

  it('changing a text counts the text it replaces only once', async () => {
    const user = newUser();
    const wide = '字'.repeat(USER_TEXT_LIMITS.text - 10);
    const id = newId();
    await api.create(request('POST', '/api/texts', { user, body: { id, ...content({ text: wide }) } }));
    expect((await api.update(request('PUT', `/api/texts/${id}`, { user, body: content({ text: `${wide.slice(1)}一` }) }), id)).status).toBe(200);
  });

  it('is rate limited like the poems: writing is limited more than reading', async () => {
    const limited = createTextsApi({
      authenticate: testAuthenticator(),
      textsOf: userId => new PostgresTextRepository(db, userId),
      limiter: createDbRateLimiter(db),
    });
    const user = newUser();
    let refused = 0;
    for (let i = 0; i < 61; i++) {
      const response = await limited.remove(request('DELETE', '/api/texts/my-aaaaaaaa', { user }), 'my-aaaaaaaa');
      if (response.status === 429) refused++;
    }
    expect(refused).toBeGreaterThan(0);
    expect((await limited.list(request('GET', '/api/texts', { user }))).status).toBe(200);
  });
});

describe('deleting an account', () => {
  it('deletes the texts with the poems, and not another user’s', async () => {
    const [gone, kept] = [newUser(), newUser()];
    await add(gone);
    await add(kept);
    await createAccountStore({ db, noAuthUser: true }).deleteAccount(gone);
    expect(await listOf(gone)).toHaveLength(0);
    expect(await listOf(kept)).toHaveLength(1);
  });

  it('still deletes an account when the database was made before texts could be kept (no such table)', async () => {
    const old = await createTestDb();
    await old.exec('drop table user_texts');
    await expect(createAccountStore({ db: old, noAuthUser: true }).deleteAccount(newUser())).resolves.toBeUndefined();
    await old.close();
  });
});
