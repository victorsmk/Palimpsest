import { afterAll } from 'vitest';
import { BrowserBookRepository } from '@/lib/repositories';
import { HttpBookRepository } from '@/lib/repositories/http/HttpBookRepository';
import type { PoemsApi } from '@/lib/server/api/handlers';
import { createLibraryApi } from '@/lib/server/api/library';
import { createTestDb, type TestDb } from '../helpers/pgliteDb';
import { inProcessFetch } from '../helpers/inProcessApi';
import { seedPassages } from '../helpers/library';
import { runLibrarySearchContract } from '../contract/librarySearchContract';

// The same rules for the books bundled with the app and for the library on the server, read over HTTP.

runLibrarySearchContract('bundled books', passages => new BrowserBookRepository(passages));

const databases: TestDb[] = [];
afterAll(() => Promise.all(databases.map(db => db.close())));

// Starting a database takes a moment, so tests that ask for the same passages share one (nothing here writes).
const shared = new Map<string, Promise<HttpBookRepository>>();

runLibrarySearchContract('the server’s library, over HTTP', passages => {
  const key = passages.map(p => p.id).join('|');
  let repo = shared.get(key);
  if (!repo) {
    repo = (async () => {
      const db = await createTestDb();
      databases.push(db);
      await seedPassages(db, passages);
      return new HttpBookRepository({ fetch: inProcessFetch({} as PoemsApi, createLibraryApi({ db })) });
    })();
    shared.set(key, repo);
  }
  return repo;
});
