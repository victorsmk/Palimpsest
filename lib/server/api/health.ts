import type { Db } from '../db';
import type { ServerConfig } from './config';

/** What /api/health answers. Names of settings and plain words only; never a value, a key, or an address. */
export interface Health {
  ok: boolean;
  settings: string;
  database: string;
  signIn: string;
  accountDeletion: string;
}

export interface HealthInput {
  /** The settings, or why they could not be read. */
  config: ServerConfig | { problem: string };
  /** Absent when the settings were not usable. */
  db?: Db;
  /** For tests. */
  fetch?: typeof fetch;
}

const isConfig = (config: HealthInput['config']): config is ServerConfig => !('problem' in config);

/**
 * Whether the server is set up: the settings are all there, the database answers and has the poems table,
 * and the sign-in service answers. It is how the person deploying checks their work without signing in, so it
 * needs no sign-in itself, and so it tells only what is missing (by name) and what works, nothing more.
 */
export async function checkHealth(input: HealthInput): Promise<{ status: 200 | 503; body: Health }> {
  const body: Health = { ok: false, settings: 'ok', database: 'not checked', signIn: 'not checked', accountDeletion: 'not checked' };
  const { config } = input;
  if (!isConfig(config)) {
    body.settings = config.problem;
    return { status: 503, body };
  }

  // The database, and that the schema has been run.
  try {
    await input.db!.query('select 1 from poems limit 1');
    body.database = 'ok';
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const cause = (error as { cause?: unknown } | null)?.cause;
    body.database = code === '42P01' || (cause as { code?: unknown } | null)?.code === '42P01' ? 'connected, but the poems table is missing (run db/schema.sql)' : 'could not be reached';
  }

  // The sign-in service.
  if (config.testAuth) {
    body.signIn = 'test sign-in (development only)';
  } else if (config.supabase) {
    try {
      const response = await (input.fetch ?? fetch)(`${config.supabase.url}/auth/v1/health`, {
        headers: { apikey: config.supabase.anonKey },
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      body.signIn = response.ok ? 'ok' : `Supabase answered ${response.status} (check SUPABASE_URL and SUPABASE_ANON_KEY)`;
    } catch {
      body.signIn = 'Supabase could not be reached (check SUPABASE_URL)';
    }
  }

  body.accountDeletion = config.testAuth || config.serviceRoleKey ? 'ready' : 'not set up (needs SUPABASE_SERVICE_ROLE_KEY)';
  body.ok = body.database === 'ok' && (body.signIn === 'ok' || config.testAuth) && body.accountDeletion === 'ready';
  return { status: body.ok ? 200 : 503, body };
}
