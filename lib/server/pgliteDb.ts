import type { Db } from './db';

/** The little of PGlite (Postgres running inside this process) that the Db needs. */
export interface PgliteLike {
  query<Row>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  transaction<T>(work: (tx: { query<Row>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }> }) => Promise<T>): Promise<T>;
}

/**
 * A Db over PGlite. `before` is called ahead of every statement and transaction (the tests use it to
 * make the database fail on purpose).
 */
export function dbOfPglite(pg: PgliteLike, before: () => void = () => {}): Db {
  const wrap = (target: Pick<PgliteLike, 'query'>): Db => ({
    async query<Row = Record<string, unknown>>(sql: string, params?: unknown[]) {
      before();
      const result = await target.query<Row>(sql, params);
      return { rows: result.rows };
    },
    transaction: work => work(wrap(target)),
  });
  const db = wrap(pg);
  return {
    query: db.query,
    transaction: async <T>(work: (tx: Db) => Promise<T>) => {
      before();
      return pg.transaction(async tx => work(wrap(tx)));
    },
  };
}
