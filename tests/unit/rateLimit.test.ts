import { describe, it, expect, afterAll, vi } from 'vitest';
import { RateLimitedError } from '@/lib/models';
import { PostgresPoemRepository } from '@/lib/server/PostgresPoemRepository';
import { createPoemsApi } from '@/lib/server/api/handlers';
import { createAccountStore } from '@/lib/server/api/accounts';
import { testAuthenticator } from '@/lib/server/api/auth';
import { errorResponse } from '@/lib/server/api/http';
import { RATE_LIMITS, createDbRateLimiter, type RateLimit } from '@/lib/server/api/rateLimit';
import { createTestDb } from '../helpers/pgliteDb';
import { draftOf, poem } from '../contract/poemRepositoryContract';

// Counting a user's requests: the counter itself (on real SQL), and the API that uses it.

const db = await createTestDb();
afterAll(() => db.close());

const newUser = () => crypto.randomUUID();
const rule: RateLimit = { bucket: 'test', limit: 3, windowMs: 60_000 };
const hitsOf = async (bucket: string, subject: string) =>
  (await db.query<{ hits: number }>('select hits from rate_limits where bucket = $1 and subject = $2', [bucket, subject])).rows[0]?.hits;

describe('the counter', () => {
  it('lets a user make as many requests as the limit, and refuses the next', async () => {
    const limiter = createDbRateLimiter(db, { now: () => 1_000_000, random: () => 1 });
    const user = newUser();
    for (let i = 0; i < 3; i++) await limiter.check(rule, user);
    await expect(limiter.check(rule, user)).rejects.toBeInstanceOf(RateLimitedError);
    await expect(limiter.check(rule, user)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('counts each user, and each kind of request, apart', async () => {
    const limiter = createDbRateLimiter(db, { now: () => 1_000_000, random: () => 1 });
    const [a, b] = [newUser(), newUser()];
    for (let i = 0; i < 3; i++) await limiter.check(rule, a);
    await expect(limiter.check(rule, a)).rejects.toBeInstanceOf(RateLimitedError);
    await limiter.check(rule, b); // someone else is not held back
    await limiter.check({ ...rule, bucket: 'other' }, a); // nor is another kind of request
  });

  it('starts again in the next window', async () => {
    let at = 1_000_000;
    const limiter = createDbRateLimiter(db, { now: () => at, random: () => 1 });
    const user = newUser();
    for (let i = 0; i < 3; i++) await limiter.check(rule, user);
    await expect(limiter.check(rule, user)).rejects.toBeInstanceOf(RateLimitedError);
    at += 60_000;
    await limiter.check(rule, user);
    expect(await hitsOf('test', user)).toBe(1);
  });

  it('says how long to wait: until the window ends', async () => {
    const start = 120_000; // a window began here
    const limiter = createDbRateLimiter(db, { now: () => start + 45_500, random: () => 1 });
    const user = newUser();
    for (let i = 0; i < 3; i++) await limiter.check(rule, user);
    const error = (await limiter.check(rule, user).catch(e => e)) as RateLimitedError;
    expect(error.retryAfterSeconds).toBe(15); // 14.5 seconds, rounded up
    const response = errorResponse(error);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('15');
  });

  it('counts two requests at the same moment as two', async () => {
    const limiter = createDbRateLimiter(db, { now: () => 1_000_000, random: () => 1 });
    const user = newUser();
    await Promise.all(Array.from({ length: 3 }, () => limiter.check(rule, user)));
    expect(await hitsOf('test', user)).toBe(3);
    const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => limiter.check(rule, user)));
    expect(outcomes.every(o => o.status === 'rejected')).toBe(true);
  });

  it('does not let an instance whose clock is behind start an old window again', async () => {
    const user = newUser();
    await createDbRateLimiter(db, { now: () => 180_000, random: () => 1 }).check(rule, user);
    await createDbRateLimiter(db, { now: () => 30_000, random: () => 1 }).check(rule, user); // an earlier window
    expect(await hitsOf('test', user)).toBe(2);
    await createDbRateLimiter(db, { now: () => 180_000, random: () => 1 }).check(rule, user); // back in the real one: still the same count
    expect(await hitsOf('test', user)).toBe(3);
  });

  it('lets requests through, and says so in the log, when it cannot count', async () => {
    const broken = await createTestDb();
    broken.failWrites();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await createDbRateLimiter(broken, { random: () => 1 }).check(rule, newUser());
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
    await broken.close();
  });

  it('lets requests through when its table was never made', async () => {
    const old = await createTestDb();
    await old.exec('drop table rate_limits');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await createDbRateLimiter(old, { random: () => 1 }).check(rule, newUser());
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
    await old.close();
  });

  it('removes counters older than two days now and then, and keeps newer ones', async () => {
    const day = 24 * 3_600_000;
    const [old, recent] = [newUser(), newUser()];
    await createDbRateLimiter(db, { now: () => 100 * day, random: () => 1 }).check(rule, old);
    await createDbRateLimiter(db, { now: () => 102 * day, random: () => 1 }).check(rule, recent);
    await createDbRateLimiter(db, { now: () => 102.5 * day, random: () => 0 }).check(rule, newUser()); // this one cleans
    expect(await hitsOf('test', old)).toBeUndefined();
    expect(await hitsOf('test', recent)).toBe(1);
  });

  it('does not clean on most requests', async () => {
    const day = 24 * 3_600_000;
    const old = newUser();
    await createDbRateLimiter(db, { now: () => 10 * day, random: () => 1 }).check(rule, old);
    await createDbRateLimiter(db, { now: () => 200 * day, random: () => 0.9 }).check(rule, newUser());
    expect(await hitsOf('test', old)).toBe(1);
  });

  it('has a sensible rule for each kind of request', () => {
    expect(RATE_LIMITS.write.limit).toBeLessThan(RATE_LIMITS.read.limit);
    expect(RATE_LIMITS.account.windowMs).toBeGreaterThan(RATE_LIMITS.write.windowMs);
    expect(new Set(Object.values(RATE_LIMITS).map(r => r.bucket)).size).toBe(3);
  });
});

describe('the API with the counter', () => {
  const fixed = { now: () => 5_000_000, random: () => 1 };
  const api = createPoemsApi({
    authenticate: testAuthenticator(),
    poemsOf: userId => new PostgresPoemRepository(db, userId),
    limiter: createDbRateLimiter(db, fixed),
    accounts: createAccountStore({ db, noAuthUser: true }),
  });
  const asUser = (id: string) => ({ Authorization: `Bearer test-user:${id}` });
  const body = () => JSON.stringify(draftOf(poem('x')));
  const save = (user: string) => api.create(new Request('http://localhost/api/poems', { method: 'POST', headers: { ...asUser(user), 'Content-Type': 'application/json' }, body: body() }));
  const list = (user: string) => api.list(new Request('http://localhost/api/poems', { headers: asUser(user) }));

  it('answers 429, with the usual error body and a Retry-After, after too many saves', async () => {
    const user = newUser();
    for (let i = 0; i < RATE_LIMITS.write.limit; i++) expect((await save(user)).status).toBe(201);
    const refused = await save(user);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('rate-limited');
    expect(await db.query('select count(*)::int as n from poems where user_id = $1', [user])).toEqual({ rows: [{ n: RATE_LIMITS.write.limit }] }); // the refused one saved nothing
  });

  it('does not let saving use up the allowance for reading, or the other way round', async () => {
    const user = newUser();
    for (let i = 0; i < RATE_LIMITS.write.limit + 1; i++) await save(user);
    expect((await list(user)).status).toBe(200);
    const reader = newUser();
    for (let i = 0; i < RATE_LIMITS.read.limit; i++) expect((await list(reader)).status).toBe(200);
    expect((await list(reader)).status).toBe(429);
    expect((await save(reader)).status).toBe(201);
  });

  it('does not hold one user back for what another did', async () => {
    const busy = newUser();
    for (let i = 0; i < RATE_LIMITS.write.limit + 1; i++) await save(busy);
    expect((await save(newUser())).status).toBe(201);
  });

  it('counts a user only once they are known: a request with no sign-in is 401, not 429, and uses nothing', async () => {
    const before = (await db.query<{ n: number }>('select count(*)::int as n from rate_limits')).rows[0].n;
    for (let i = 0; i < 5; i++) expect((await api.list(new Request('http://localhost/api/poems'))).status).toBe(401);
    expect((await db.query<{ n: number }>('select count(*)::int as n from rate_limits')).rows[0].n).toBe(before);
  });

  it.each([
    ['get', (u: string) => api.get(new Request('http://localhost/api/poems/x', { headers: asUser(u) }), 'x'), 'read'],
    ['count', (u: string) => api.count(new Request('http://localhost/api/collection/count', { headers: asUser(u) })), 'read'],
    ['lookup', (u: string) => api.lookup(new Request('http://localhost/api/collection/lookup', { method: 'POST', headers: { ...asUser(u), 'Content-Type': 'application/json' }, body: '{"ids":[]}' })), 'read'],
    ['remove', (u: string) => api.remove(new Request('http://localhost/api/poems/x', { method: 'DELETE', headers: asUser(u) }), 'x'), 'write'],
    ['update', (u: string) => api.update(new Request('http://localhost/api/poems/x', { method: 'PUT', headers: { ...asUser(u), 'If-Match': '1', 'Content-Type': 'application/json' }, body: body() }), 'x'), 'write'],
    ['import', (u: string) => api.importPoems(new Request('http://localhost/api/collection/import', { method: 'POST', headers: { ...asUser(u), 'Content-Type': 'application/json' }, body: '{"poems":[]}' })), 'write'],
  ])('%s is counted as a %s', async (_name, call, bucket) => {
    const user = newUser();
    await call(user);
    expect(await hitsOf(bucket, user)).toBe(1);
  });

  it('allows five attempts at deleting an account an hour, and then says to wait', async () => {
    const user = newUser();
    const failing = createPoemsApi({
      authenticate: testAuthenticator(),
      poemsOf: userId => new PostgresPoemRepository(db, userId),
      limiter: createDbRateLimiter(db, fixed),
      accounts: { canDelete: () => true, deleteAccount: async () => { throw new Error('Supabase is down'); } },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ask = () => failing.deleteAccount(new Request('http://localhost/api/account', { method: 'DELETE', headers: asUser(user) }));
    for (let i = 0; i < RATE_LIMITS.account.limit; i++) expect((await ask()).status).toBe(500);
    expect((await ask()).status).toBe(429);
    log.mockRestore();
  });

  it('removes a deleted account’s counters, and only that account’s', async () => {
    const [gone, stays] = [newUser(), newUser()];
    await save(gone);
    await save(stays);
    const response = await api.deleteAccount(new Request('http://localhost/api/account', { method: 'DELETE', headers: asUser(gone) }));
    expect(response.status).toBe(204);
    expect((await db.query('select 1 from rate_limits where subject = $1', [gone])).rows).toEqual([]);
    expect(await hitsOf('write', stays)).toBe(1);
  });

  it('still deletes the account when the counters cannot be removed', async () => {
    const user = newUser();
    await save(user);
    const accounts = createAccountStore({ db: { ...db, query: async (sql, params) => (sql.includes('rate_limits') ? Promise.reject(new Error('no')) : db.query(sql, params)) }, noAuthUser: true });
    await accounts.deleteAccount(user);
    expect((await db.query('select 1 from poems where user_id = $1', [user])).rows).toEqual([]);
  });

  it('does not limit anything when no counter is given', async () => {
    const free = createPoemsApi({ authenticate: testAuthenticator(), poemsOf: userId => new PostgresPoemRepository(db, userId) });
    const user = newUser();
    for (let i = 0; i < RATE_LIMITS.write.limit + 5; i++) {
      expect((await free.create(new Request('http://localhost/api/poems', { method: 'POST', headers: { ...asUser(user), 'Content-Type': 'application/json' }, body: body() }))).status).toBe(201);
    }
  });
});
