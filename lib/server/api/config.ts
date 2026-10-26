import { UnavailableError } from '@/lib/models';

/**
 * What the server needs from its environment. Nothing here is ever sent to the browser or logged.
 *
 *   DATABASE_URL         the Postgres connection string (Supabase: Project settings, Database)
 *   SUPABASE_URL         the project's address, such as https://abcd.supabase.co
 *   SUPABASE_ANON_KEY    the project's public "anon" key (it is only used to ask Supabase who a token belongs to)
 *   PALIMPSEST_TEST_AUTH set to "1" to sign in with a fake token in development and in tests. Refused in production.
 */
export interface ServerConfig {
  databaseUrl: string;
  /** Present when sign-in goes through Supabase. */
  supabase: { url: string; anonKey: string } | null;
  testAuth: boolean;
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
  return { databaseUrl, supabase, testAuth };
}
