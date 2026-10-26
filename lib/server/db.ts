/**
 * The little the server needs from a database: run a statement, and run several as one. The real one
 * (pgDb.ts) talks to Postgres; the tests use an in-process Postgres behind the same two methods, so
 * the SQL that runs in production is the SQL that is tested.
 */
export interface Db {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  /** Runs `work` as one transaction: everything it does is kept, or (if it throws) none of it. */
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>;
}
