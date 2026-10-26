import { UnavailableError } from '@/lib/models';

/**
 * What the server needs from its environment. Nothing here is ever sent to the browser or logged.
 *
 *   DATABASE_URL         the Postgres connection string (Supabase: Project settings, Database)
 *   DATABASE_CA_CERT     optional: the database's certificate authority (PEM text), to check the database's identity too
 *   DATABASE_POOL_MAX    optional: most connections one server instance holds (default 3)
 *   SUPABASE_URL         the project's address, such as https://abcd.supabase.co
 *   SUPABASE_ANON_KEY    the project's public "anon" key (it is only used to ask Supabase who a token belongs to)
 *   SUPABASE_SERVICE_ROLE_KEY  the project's SECRET key, only for deleting an account (it can do anything to the project:
 *                        server only, never in a NEXT_PUBLIC_ setting, never in the browser)
 *   PALIMPSEST_TEST_AUTH set to "1" to sign in with a fake token in development and in tests. Refused in production.
 */
export interface ServerConfig {
  databaseUrl: string;
  /** Present when sign-in goes through Supabase. */
  supabase: { url: string; anonKey: string } | null;
  /** The secret key for deleting accounts. Without it, accounts cannot be deleted (and nothing is deleted when one is tried). */
  serviceRoleKey: string | null;
  testAuth: boolean;
  /** The database's certificate authority, to check its identity; null to encrypt without checking. */
  caCert: string | null;
  /** The most connections one server instance holds open, if set. */
  poolMax: number | undefined;
}

/** The setting is wrong or missing. The server cannot work, which the browser sees as the server being unavailable. */
export class ConfigError extends UnavailableError {
  constructor(readonly problem: string) {
    super();
    this.message = 'The server is not set up yet.';
  }
}

type Env = Record<string, string | undefined>;

export function readServerConfig(env: Env): ServerConfig {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new ConfigError('DATABASE_URL is not set.');

  const testAuth = env.PALIMPSEST_TEST_AUTH === '1';
  if (testAuth && env.NODE_ENV === 'production') {
    throw new ConfigError('PALIMPSEST_TEST_AUTH is set, and must never be in production.');
  }

  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  if (!testAuth && (!url || !anonKey)) throw new ConfigError('SUPABASE_URL and SUPABASE_ANON_KEY are not set.');
  let supabase: ServerConfig['supabase'] = null;
  if (url && anonKey) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error('not https');
      supabase = { url: parsed.origin, anonKey };
    } catch {
      throw new ConfigError('SUPABASE_URL is not a valid address.');
    }
  }
  const poolText = env.DATABASE_POOL_MAX?.trim();
  const poolMax = poolText === undefined || poolText === '' ? undefined : Number(poolText);
  if (poolMax !== undefined && (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 50)) {
    throw new ConfigError('DATABASE_POOL_MAX must be a whole number from 1 to 50.');
  }
  return {
    databaseUrl,
    supabase,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
    testAuth,
    caCert: env.DATABASE_CA_CERT?.trim() || null,
    poolMax,
  };
}
