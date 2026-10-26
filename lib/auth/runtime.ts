import { AuthManager } from './AuthManager';
import { createTestAuthClient } from './testClient';
import { createSupabaseAuthClient, type SupabaseLike } from './supabaseClient';
import type { AuthClient } from './types';

type Env = Record<string, string | undefined>;

/**
 * The sign-in service this build uses, from its settings (all NEXT_PUBLIC_, so all public):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  Supabase (the old name NEXT_PUBLIC_SUPABASE_ANON_KEY works too)
 *   NEXT_PUBLIC_TEST_AUTH=1                                  the made-up sign-in, never in a production build
 * Supabase's client is loaded only when it is used.
 */
export async function createAuthClient(env: Env): Promise<AuthClient> {
  if (env.NEXT_PUBLIC_TEST_AUTH === '1') {
    if (env.NODE_ENV === 'production') throw new Error('NEXT_PUBLIC_TEST_AUTH is set in a production build, and must never be.');
    return createTestAuthClient();
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set.');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const googleClientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return createSupabaseAuthClient(supabase as unknown as SupabaseLike, googleClientId ? { google: { clientId: googleClientId } } : {});
}

/**
 * What to tell a person trying the app with the made-up sign-in (the local demo), or null when sign-in is the real one.
 * The setting is written out in full so that Next puts it into the page at build time.
 */
export function demoSignInHint(): string | null {
  return process.env.NEXT_PUBLIC_TEST_AUTH === '1' && process.env.NODE_ENV !== 'production'
    ? 'Demo: use any email address, and the code 123456. Nothing is sent.'
    : null;
}

/**
 * Whether the sign-in dialog offers the email-and-code form. It does unless NEXT_PUBLIC_EMAIL_SIGN_IN is "off"
 * (for a site that signs in with Google only, because it has no email service to send codes).
 * The setting is written out in full so that Next puts it into the page at build time.
 */
export function emailSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EMAIL_SIGN_IN?.trim().toLowerCase() !== 'off';
}

let manager: AuthManager | undefined;

/** The one AuthManager of this page. Browser only. */
export function getAuth(): AuthManager {
  // The settings are written out one by one: Next puts a NEXT_PUBLIC_ setting into the page at build time only where it is spelled out like this.
  manager ??= new AuthManager(
    createAuthClient({
      NEXT_PUBLIC_TEST_AUTH: process.env.NEXT_PUBLIC_TEST_AUTH,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      NODE_ENV: process.env.NODE_ENV,
    })
  );
  return manager;
}
