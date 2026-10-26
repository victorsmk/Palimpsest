import { AuthManager } from './AuthManager';
import { createTestAuthClient } from './testClient';
import { createSupabaseAuthClient, type SupabaseLike } from './supabaseClient';
import type { AuthClient } from './types';

type Env = Record<string, string | undefined>;

/**
 * The sign-in service this build uses, from its settings (all NEXT_PUBLIC_, so all public):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY  Supabase
 *   NEXT_PUBLIC_TEST_AUTH=1                                  the made-up sign-in, never in a production build
 * Supabase's client is loaded only when it is used.
 */
export async function createAuthClient(env: Env): Promise<AuthClient> {
  if (env.NEXT_PUBLIC_TEST_AUTH === '1') {
    if (env.NODE_ENV === 'production') throw new Error('NEXT_PUBLIC_TEST_AUTH is set in a production build, and must never be.');
    return createTestAuthClient();
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return createSupabaseAuthClient(supabase as unknown as SupabaseLike);
}

let manager: AuthManager | undefined;

/** The one AuthManager of this page. Browser only. */
export function getAuth(): AuthManager {
  // The settings are written out one by one: Next puts a NEXT_PUBLIC_ setting into the page at build time only where it is spelled out like this.
  manager ??= new AuthManager(
    createAuthClient({
      NEXT_PUBLIC_TEST_AUTH: process.env.NEXT_PUBLIC_TEST_AUTH,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NODE_ENV: process.env.NODE_ENV,
    })
  );
  return manager;
}
