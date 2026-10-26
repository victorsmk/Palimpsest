import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import type { Db } from './db';

export interface PgDbOptions {
  /** The most connections one server instance holds open. Small, since many instances may run at once. */
  max?: number;
  /** The certificate authority of the database (PEM text). With it, the server's identity is checked too. */
  caCert?: string;
}

/**
 * How to connect, from a connection string. A string asking for `sslmode=require` (which Supabase's
 * is) gets an encrypted connection; its certificate is not checked, because Supabase's is signed by its
 * own authority, which Node does not know, unless the authority's certificate is given (`caCert`), in
 * which case it is checked. A string with no `sslmode` (a database on this computer) is left alone.
 */
export function poolConfigFor(connectionString: string, options: PgDbOptions = {}): PoolConfig {
  const config: PoolConfig = { connectionString, max: options.max ?? 3 };
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return config; // let the driver say what is wrong with it
  }
  const mode = url.searchParams.get('sslmode');
  if (mode && mode !== 'disable') {
    // The driver would turn "require" into a full check on its own; the setting is taken out so that what is asked for here wins.
    url.searchParams.delete('sslmode');
    config.connectionString = url.toString();
    config.ssl = options.caCert ? { ca: options.caCert, rejectUnauthorized: true } : { rejectUnauthorized: false };
  }
  return config;
}

/** A Db over a pool of connections to Postgres (`connectionString`, from the environment). */
export function createPgDb(connectionString: string, options: PgDbOptions = {}): Db & { end(): Promise<void> } {
  const pool = new Pool(poolConfigFor(connectionString, options));
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
