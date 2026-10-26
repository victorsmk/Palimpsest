import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { Db } from './db';

/** A Db over a pool of connections to Postgres (`connectionString`, from the environment). */
export function createPgDb(connectionString: string): Db & { end(): Promise<void> } {
  const pool = new Pool({ connectionString, max: 5 });
  return {
    async query<Row = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const result = await pool.query<QueryResultRow>(sql, params);
      return { rows: result.rows as Row[] };
    },
    async transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await work(clientDb(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

/** One connection that is inside a transaction: a nested `transaction` just joins it. */
function clientDb(client: PoolClient): Db {
  const db: Db = {
    async query<Row = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const result = await client.query<QueryResultRow>(sql, params);
      return { rows: result.rows as Row[] };
    },
    transaction: work => work(db),
  };
  return db;
}
