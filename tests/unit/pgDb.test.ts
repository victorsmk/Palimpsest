import { describe, it, expect, vi, beforeEach } from 'vitest';

// pgDb.ts is the one piece of the server that talks to a real Postgres, which is not available to the
// tests. This checks what it can without one: that it hands statements to the driver as given, and
// that a transaction begins, commits or rolls back, and always gives its connection back.

const calls: string[] = [];
const state = { failOn: '' as string, ended: false };

vi.mock('pg', () => {
  class Pool {
    constructor(public options: unknown) {
      calls.push(`pool ${JSON.stringify(options)}`);
    }
    async query(sql: string, params?: unknown[]) {
      calls.push(`pool.query ${sql} ${JSON.stringify(params ?? [])}`);
      return { rows: [{ n: 1 }] };
    }
    async connect() {
      calls.push('connect');
      return {
        query: async (sql: string, params?: unknown[]) => {
          calls.push(`client.query ${sql} ${JSON.stringify(params ?? [])}`);
          if (state.failOn && sql.includes(state.failOn)) throw new Error(`failed: ${sql}`);
          return { rows: [] };
        },
        release: () => calls.push('release'),
      };
    }
    async end() {
      state.ended = true;
    }
  }
  return { Pool };
});

const { createPgDb } = await import('@/lib/server/pgDb');

beforeEach(() => {
  calls.length = 0;
  state.failOn = '';
  state.ended = false;
});

describe('the Postgres connection', () => {
  it('is a pool made from the connection string, and runs statements with their parameters', async () => {
    const db = createPgDb('postgres://example/db');
    expect(calls[0]).toBe('pool {"connectionString":"postgres://example/db","max":5}');
    expect(await db.query('select $1', ['x'])).toEqual({ rows: [{ n: 1 }] });
    expect(calls[1]).toBe('pool.query select $1 ["x"]');
    await db.end();
    expect(state.ended).toBe(true);
  });

  it('keeps everything a transaction does, on one connection, and gives the connection back', async () => {
    const db = createPgDb('postgres://example/db');
    calls.length = 0;
    const result = await db.transaction(async tx => {
      await tx.query('insert a', [1]);
      await tx.query('insert b', [2]);
      return 'done';
    });
    expect(result).toBe('done');
    expect(calls).toEqual(['connect', 'client.query begin []', 'client.query insert a [1]', 'client.query insert b [2]', 'client.query commit []', 'release']);
  });

  it('undoes everything and gives the connection back when the work fails, and passes the failure on', async () => {
    const db = createPgDb('postgres://example/db');
    calls.length = 0;
    await expect(
      db.transaction(async tx => {
        await tx.query('insert a');
        throw new Error('refused');
      })
    ).rejects.toThrow('refused');
    expect(calls).toEqual(['connect', 'client.query begin []', 'client.query insert a []', 'client.query rollback []', 'release']);
  });

  it('undoes everything when the commit itself fails', async () => {
    const db = createPgDb('postgres://example/db');
    calls.length = 0;
    state.failOn = 'commit';
    await expect(db.transaction(async tx => void (await tx.query('insert a')))).rejects.toThrow('failed: commit');
    expect(calls.slice(-2)).toEqual(['client.query rollback []', 'release']);
  });

  it('still gives the connection back, and reports the first failure, if the rollback fails too', async () => {
    const db = createPgDb('postgres://example/db');
    calls.length = 0;
    state.failOn = 'rollback';
    await expect(
      db.transaction(async () => {
        throw new Error('the real problem');
      })
    ).rejects.toThrow('the real problem');
    expect(calls.at(-1)).toBe('release');
  });

  it('lets a transaction started inside a transaction join it, on the same connection', async () => {
    const db = createPgDb('postgres://example/db');
    calls.length = 0;
    await db.transaction(tx => tx.transaction(inner => inner.query('select 1')));
    expect(calls.filter(c => c === 'connect')).toHaveLength(1);
    expect(calls.filter(c => c.includes('begin'))).toHaveLength(1);
    expect(calls.filter(c => c.includes('commit'))).toHaveLength(1);
  });
});
