import { describe, it, expect, afterAll, vi } from 'vitest';
import { checkHealth } from '@/lib/server/api/health';
import { readServerConfig } from '@/lib/server/api/config';
import { poolConfigFor } from '@/lib/server/pgDb';
import { createTestDb } from '../helpers/pgliteDb';

const db = await createTestDb();
afterAll(() => db.close());

const env = {
  DATABASE_URL: 'postgres://user:SECRET-PASSWORD@db.example.org:6543/postgres?sslmode=require',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_ANON_KEY: 'ANON-KEY-VALUE',
  SUPABASE_SERVICE_ROLE_KEY: 'SERVICE-KEY-VALUE',
};
const config = (extra: Record<string, string> = {}) => readServerConfig({ ...env, ...extra });
const supabaseAnswers = (status = 200) => vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;

describe('the health check', () => {
  it('is ok when the settings, the database, the sign-in service and the account deletion are all in place', async () => {
    const fetcher = supabaseAnswers();
    const { status, body } = await checkHealth({ config: config(), db, fetch: fetcher });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, settings: 'ok', database: 'ok', signIn: 'ok', accountDeletion: 'ready' });
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://abc.supabase.co/auth/v1/health');
    expect(init.headers).toEqual({ apikey: 'ANON-KEY-VALUE' });
  });

  it('says which setting is wrong when the settings cannot be read, and checks nothing else', async () => {
    const { status, body } = await checkHealth({ config: { problem: 'DATABASE_URL is not set.' } });
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, settings: 'DATABASE_URL is not set.', database: 'not checked', signIn: 'not checked', accountDeletion: 'not checked' });
  });

  it('says the poems table is missing when the schema has not been run', async () => {
    const empty = await createTestDb();
    await empty.exec('drop table poems');
    const { status, body } = await checkHealth({ config: config(), db: empty, fetch: supabaseAnswers() });
    expect(status).toBe(503);
    expect(body.database).toBe('connected, but the poems table is missing (run db/schema.sql)');
    expect(body.ok).toBe(false);
    await empty.close();
  });

  it('says the database could not be reached when it cannot', async () => {
    const down = await createTestDb();
    down.failWrites();
    const { status, body } = await checkHealth({ config: config(), db: down, fetch: supabaseAnswers() });
    expect(status).toBe(503);
    expect(body.database).toBe('could not be reached');
    await down.close();
  });

  it('says when Supabase answers badly or cannot be reached', async () => {
    const bad = await checkHealth({ config: config(), db, fetch: supabaseAnswers(401) });
    expect(bad.status).toBe(503);
    expect(bad.body.signIn).toBe('Supabase answered 401 (check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY)');
    const gone = await checkHealth({ config: config(), db, fetch: (async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch });
    expect(gone.status).toBe(503);
    expect(gone.body.signIn).toBe('Supabase could not be reached (check SUPABASE_URL)');
  });

  it('says account deletion is not set up when the secret key is missing, and is not ok then', async () => {
    const { status, body } = await checkHealth({ config: readServerConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }), db, fetch: supabaseAnswers() });
    expect(status).toBe(503);
    expect(body.accountDeletion).toBe('not set up (needs SUPABASE_SECRET_KEY)');
    expect(body.signIn).toBe('ok');
  });

  it('is ok with the test sign-in outside production, without asking Supabase', async () => {
    const fetcher = supabaseAnswers();
    const { status, body } = await checkHealth({
      config: readServerConfig({ DATABASE_URL: 'postgres://x', PALIMPSEST_TEST_AUTH: '1', NODE_ENV: 'development' }),
      db,
      fetch: fetcher,
    });
    expect(status).toBe(200);
    expect(body.signIn).toBe('test sign-in (development only)');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never says a password, a key or an address, whatever is wrong', async () => {
    const results = [
      await checkHealth({ config: config(), db, fetch: supabaseAnswers(500) }),
      await checkHealth({ config: config(), db, fetch: (async () => Promise.reject(new Error('could not reach https://abc.supabase.co with ANON-KEY-VALUE'))) as unknown as typeof fetch }),
      await checkHealth({ config: readServerConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }), db, fetch: supabaseAnswers() }),
    ];
    for (const { body } of results) {
      const text = JSON.stringify(body);
      for (const secret of ['SECRET-PASSWORD', 'ANON-KEY-VALUE', 'SERVICE-KEY-VALUE', 'db.example.org', 'abc.supabase.co']) expect(text).not.toContain(secret);
    }
  });
});

describe('how the database is connected to', () => {
  const url = 'postgres://postgres.abc:pw@aws-0-eu.pooler.supabase.com:6543/postgres';

  it('encrypts without checking the server’s certificate when the string says sslmode=require, as Supabase’s does', () => {
    const config = poolConfigFor(`${url}?sslmode=require`);
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).not.toContain('sslmode'); // so the driver does not turn it into a full check of its own
    expect(config.connectionString).toContain('aws-0-eu.pooler.supabase.com:6543');
    expect(config.connectionString).toContain('postgres.abc:pw');
  });

  it('checks the certificate against the authority given, when there is one', () => {
    expect(poolConfigFor(`${url}?sslmode=require`, { caCert: 'PEM TEXT' }).ssl).toEqual({ ca: 'PEM TEXT', rejectUnauthorized: true });
  });

  it('leaves a database with no sslmode (one on this computer) alone', () => {
    const config = poolConfigFor('postgres://u:p@localhost:5432/db');
    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toBe('postgres://u:p@localhost:5432/db');
  });

  it('does not encrypt when it is told not to', () => {
    expect(poolConfigFor('postgres://u:p@localhost/db?sslmode=disable').ssl).toBeUndefined();
  });

  it('keeps the rest of the string, and holds few connections by default', () => {
    const config = poolConfigFor(`${url}?sslmode=require&application_name=palimpsest`);
    expect(config.connectionString).toContain('application_name=palimpsest');
    expect(config.max).toBe(3);
    expect(poolConfigFor(url, { max: 1 }).max).toBe(1);
  });

  it('passes on a string it cannot read, to be refused by the driver', () => {
    expect(poolConfigFor('not a url').connectionString).toBe('not a url');
  });
});
