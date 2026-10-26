import { afterAll } from 'vitest';
import { HttpPoemRepository } from '@/lib/repositories/http/HttpPoemRepository';
import { PostgresPoemRepository } from '@/lib/server/PostgresPoemRepository';
import { createPoemsApi } from '@/lib/server/api/handlers';
import { testAuthenticator } from '@/lib/server/api/auth';
import { createTestDb } from '../helpers/pgliteDb';
import { inProcessFetch } from '../helpers/inProcessApi';
import { runPoemRepositoryContract } from '../contract/poemRepositoryContract';

// The poem contract a third time over: the browser's HttpPoemRepository, through the real API
// handlers, onto the server's Postgres repository, on real SQL. Whatever the contract asks of a
// repository is asked of the whole road from the screen to the table.

const db = await createTestDb();
afterAll(() => db.close());

const api = createPoemsApi({ authenticate: testAuthenticator(), poemsOf: userId => new PostgresPoemRepository(db, userId) });

runPoemRepositoryContract('HttpPoemRepository → API → PostgresPoemRepository (PGlite)', () => {
  const user = crypto.randomUUID();
  return {
    repo: new HttpPoemRepository({ session: { getToken: async () => `test-user:${user}` }, fetch: inProcessFetch(api) }),
    failWrites: () => db.failWrites(),
    allowWrites: () => db.allowWrites(),
  };
});
