import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db';
import { dbOfPglite, type PgliteLike } from './pgliteDb';

/**
 * The database of the local demo (`npm run dev:demo`): Postgres running inside the server process, with the
 * real schema, and nothing on disk. It has three books in its library and no poems when the server starts and gone when it stops. It is for
 * trying the app on one computer without any account; the configuration refuses it in production.
 *
 * PGlite is loaded only here, only in the demo, and is kept out of the server bundle (see next.config.ts).
 */
export async function createDemoDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf-8'));
  const db = dbOfPglite(pg as unknown as PgliteLike);
  const { seedDemoLibrary } = await import('./demoLibrary');
  await seedDemoLibrary(db);
  return db;
}
