// A connection to the real database for the import script, with the same two methods as the server's Db.
// This is lib/server/pgDb.ts in plain JavaScript (the script cannot import TypeScript on every Node). A test
// checks that the two read a connection string the same way, so they cannot drift apart unnoticed.
import pg from 'pg';

export function poolConfigFor(connectionString, options = {}) {
  const config = { connectionString, max: options.max ?? 2 };
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return config;
  }
  const mode = url.searchParams.get('sslmode');
  if (mode && mode !== 'disable') {
    url.searchParams.delete('sslmode');
    config.connectionString = url.toString();
    config.ssl = options.caCert ? { ca: options.caCert, rejectUnauthorized: true } : { rejectUnauthorized: false };
  }
  return config;
}

export function createPgDb(connectionString, options = {}) {
  const pool = new pg.Pool(poolConfigFor(connectionString, options));
  const wrap = runner => ({
    async query(sql, params) {
      const result = await runner.query(sql, params);
      return { rows: result.rows };
    },
  });
  return {
    ...wrap(pool),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const tx = wrap(client);
        tx.transaction = inner => inner(tx);
        const result = await work(tx);
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
