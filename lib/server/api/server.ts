import { createDemoDb } from '../demoDb';
import { createPgDb } from '../pgDb';
import { createAccountStore } from './accounts';
import { PostgresPoemRepository } from '../PostgresPoemRepository';
import { supabaseAuthenticator, testAuthenticator } from './auth';
import { ConfigError, readServerConfig, type ServerConfig } from './config';
import type { Db } from '../db';
import { checkHealth } from './health';
import { createDbRateLimiter } from './rateLimit';
import { createPoemsApi, type PoemsApi } from './handlers';
import { createLibraryApi, type LibraryApi } from './library';
import { errorResponse, json } from './http';

/**
 * The poems API as the running server has it: built on first use from the environment, and kept (one
 * connection pool per server instance, reused across requests and across reloads in development). A
 * setting that is missing or wrong makes every request answer "the server is not set up", not crash.
 */
interface Running {
  api: PoemsApi;
  library: LibraryApi;
  config: ServerConfig;
  db: Db;
}

const keep = globalThis as { __palimpsestRunning?: Promise<Running> };

async function build(): Promise<Running> {
  const config = readServerConfig(process.env);
  const db = config.demo ? await createDemoDb() : createPgDb(config.databaseUrl, { max: config.poolMax, caCert: config.caCert ?? undefined });
  const accounts = createAccountStore({
    db,
    noAuthUser: config.testAuth,
    supabase: !config.testAuth && config.supabase && config.serviceRoleKey ? { url: config.supabase.url, serviceRoleKey: config.serviceRoleKey } : undefined,
  });
  const api = createPoemsApi({
    accounts,
    authenticate: config.testAuth ? testAuthenticator() : supabaseAuthenticator(config.supabase!),
    poemsOf: userId => new PostgresPoemRepository(db, userId),
    limiter: createDbRateLimiter(db),
  });
  return { api, library: createLibraryApi({ db }), config, db };
}

/** Built once, on first use. If it cannot be built, the next request tries again. */
function running(): Promise<Running> {
  if (!keep.__palimpsestRunning) {
    const starting = build();
    keep.__palimpsestRunning = starting;
    starting.catch(() => {
      if (keep.__palimpsestRunning === starting) keep.__palimpsestRunning = undefined;
    });
  }
  return keep.__palimpsestRunning;
}

/** Each method builds the API if it is not built yet, then runs; a failure to build is an error response like any other. */
function lazy<Args extends unknown[]>(pick: (api: PoemsApi) => (request: Request, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    // Reading the request first makes Next treat this as a request-time handler, so nothing here
    // (reading settings, making the connection pool) is run while the app is being built.
    request.headers.get('authorization');
    try {
      return await pick((await running()).api)(request, ...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Like `lazy`, for the library's handlers (public: nobody is asked who they are). */
function lazyLibrary<Args extends unknown[]>(pick: (api: LibraryApi) => (request: Request, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    request.headers.get('authorization'); // as in `lazy`: makes this a request-time handler
    try {
      return await pick((await running()).library)(request, ...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** GET /api/health — whether the server is set up (see health.ts). */
export async function healthResponse(request: Request): Promise<Response> {
  request.headers.get('authorization');
  let result;
  try {
    const { config, db } = await running();
    result = await checkHealth({ config, db });
  } catch (error) {
    result = await checkHealth({ config: { problem: error instanceof ConfigError ? error.problem : 'The server could not start.' } });
  }
  return json(result.body, result.status);
}

export const libraryApi = {
  books: lazyLibrary(api => api.books),
  book: lazyLibrary<[string]>(api => api.book),
  bookPassages: lazyLibrary<[string]>(api => api.bookPassages),
  passage: lazyLibrary<[string]>(api => api.passage),
};

export const poemsApi = {
  list: lazy(api => api.list),
  create: lazy(api => api.create),
  get: lazy<[string]>(api => api.get),
  update: lazy<[string]>(api => api.update),
  remove: lazy<[string]>(api => api.remove),
  count: lazy(api => api.count),
  deleteAccount: lazy(api => api.deleteAccount),
  lookup: lazy(api => api.lookup),
  importPoems: lazy(api => api.importPoems),
};
