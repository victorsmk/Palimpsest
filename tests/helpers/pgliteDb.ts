import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/server/db';

/**
 * Postgres running inside the test process (PGlite), behind the same Db the server uses, with the real
 * schema (db/schema.sql) applied. A test gets the very SQL that runs in production, with no database
 * to install. One of these is slow to start, so a test file makes one and gives each test its own user.
 */
export interface TestDb extends Db {
  /** Makes every statement fail the way a lost connection does, until `allowWrites`. */
  failWrites(): void;
  allowWrites(): void;
  /** Runs SQL text (several statements) with no parameters. */
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(readFileSync('db/schema.sql', 'utf-8'));
  let failing = false;
  const guard = () => {
    if (failing) throw new Error('connection lost');
  };
  const wrap = (target: Pick<PGlite, 'query'>): Db => ({
    async query<Row = Record<string, unknown>>(sql: string, params?: unknown[]) {
      guard();
      const result = await target.query<Row>(sql, params);
      return { rows: result.rows };
    },
    transaction: async work => work(wrap(target)),
  });
  const db = wrap(pg);
  return {
    query: db.query,
    transaction: async <T>(work: (tx: Db) => Promise<T>) => {
      guard();
      return pg.transaction(async tx => work(wrap(tx)));
    },
    failWrites: () => {
      failing = true;
    },
    allowWrites: () => {
      failing = false;
    },
    exec: sql => pg.exec(sql),
    close: () => pg.close(),
  };
}
