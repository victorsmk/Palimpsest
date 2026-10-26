import { afterAll } from 'vitest';
import { PostgresPoemRepository } from '@/lib/server/PostgresPoemRepository';
import { createTestDb } from '../helpers/pgliteDb';
import { runPoemRepositoryContract } from '../contract/poemRepositoryContract';

// The poem contract again, against the server's Postgres repository, on real SQL (an in-process
// Postgres). Each test is a new user, so they share one database without sharing poems.

const db = await createTestDb();
afterAll(() => db.close());

runPoemRepositoryContract('PostgresPoemRepository (PGlite)', () => ({
  repo: new PostgresPoemRepository(db, crypto.randomUUID()),
  failWrites: () => db.failWrites(),
  allowWrites: () => db.allowWrites(),
}));
