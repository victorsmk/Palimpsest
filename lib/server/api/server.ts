import { createPgDb } from '../pgDb';
import { PostgresPoemRepository } from '../PostgresPoemRepository';
import { supabaseAuthenticator, testAuthenticator } from './auth';
import { readServerConfig } from './config';
import { createPoemsApi, type PoemsApi } from './handlers';
import { errorResponse } from './http';

/**
 * The poems API as the running server has it: built on first use from the environment, and kept (one
 * connection pool per server instance, reused across requests and across reloads in development). A
 * setting that is missing or wrong makes every request answer "the server is not set up", not crash.
 */
const keep = globalThis as { __palimpsestPoemsApi?: PoemsApi };

function build(): PoemsApi {
  const config = readServerConfig(process.env);
  const db = createPgDb(config.databaseUrl);
  return createPoemsApi({
    authenticate: config.testAuth ? testAuthenticator() : supabaseAuthenticator(config.supabase!),
    poemsOf: userId => new PostgresPoemRepository(db, userId),
  });
}

/** Each method builds the API if it is not built yet, then runs; a failure to build is an error response like any other. */
function lazy<Args extends unknown[]>(pick: (api: PoemsApi) => (request: Request, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    // Reading the request first makes Next treat this as a request-time handler, so nothing here
    // (reading settings, making the connection pool) is run while the app is being built.
    request.headers.get('authorization');
    try {
      keep.__palimpsestPoemsApi ??= build();
      return await pick(keep.__palimpsestPoemsApi)(request, ...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const poemsApi = {
  list: lazy(api => api.list),
  create: lazy(api => api.create),
  get: lazy<[string]>(api => api.get),
  update: lazy<[string]>(api => api.update),
  remove: lazy<[string]>(api => api.remove),
  count: lazy(api => api.count),
  lookup: lazy(api => api.lookup),
  importPoems: lazy(api => api.importPoems),
};
