import { AuthError, type AuthClient, type AuthErrorCode, type AuthSession } from './types';

interface SupabaseUserLike {
  id: string;
  email?: string;
}
interface SupabaseSessionLike {
  access_token: string;
  user: SupabaseUserLike;
}
interface SupabaseErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

/** The little of Supabase's client this uses (so a stand-in can be used to test it). */
export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: SupabaseSessionLike | null }; error: SupabaseErrorLike | null }>;
    onAuthStateChange(callback: (event: string, session: SupabaseSessionLike | null) => void): { data: { subscription: { unsubscribe(): void } } };
    signInWithOtp(args: { email: string; options?: { shouldCreateUser?: boolean } }): Promise<{ error: SupabaseErrorLike | null }>;
    verifyOtp(args: { email: string; token: string; type: 'email' }): Promise<{ error: SupabaseErrorLike | null }>;
    signOut(): Promise<{ error: SupabaseErrorLike | null }>;
  };
}

const sessionOf = (session: SupabaseSessionLike | null): AuthSession | null =>
  session?.user.id && session.access_token ? { token: session.access_token, user: { id: session.user.id, email: session.user.email ?? '' } } : null;

/** Which of our errors a Supabase error is. */
export function authErrorOf(error: SupabaseErrorLike, step: 'send' | 'verify'): AuthError {
  const code = error.code ?? '';
  const text = error.message ?? '';
  let kind: AuthErrorCode = 'unavailable';
  if (error.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit/i.test(text)) kind = 'too-many';
  else if (step === 'verify' && (code === 'otp_expired' || code === 'invalid_credentials' || [400, 401, 403, 422].includes(error.status ?? 0))) kind = 'wrong-code';
  else if (step === 'send' && (code === 'validation_failed' || code === 'email_address_invalid') && /email/i.test(`${code} ${text}`)) kind = 'invalid-email';
  return new AuthError(kind, undefined, { cause: error });
}

/**
 * Sign-in through Supabase: a one-time code sent to the address, entered here. The session is kept in
 * the browser and renewed by Supabase's own client; the page never reads the address bar for a sign-in
 * (a link would leave the Studio and lose unsaved work, which is why a code is used).
 */
export function createSupabaseAuthClient(supabase: SupabaseLike): AuthClient {
  const guard = async (step: 'send' | 'verify' | 'other', run: () => Promise<{ error: SupabaseErrorLike | null }>): Promise<void> => {
    let result: { error: SupabaseErrorLike | null };
    try {
      result = await run();
    } catch (cause) {
      throw new AuthError('unavailable', undefined, { cause });
    }
    if (result.error) {
      if (step === 'other') throw new AuthError('unavailable', undefined, { cause: result.error });
      throw authErrorOf(result.error, step);
    }
  };
  return {
    async getSession() {
      try {
        return sessionOf((await supabase.auth.getSession()).data.session);
      } catch {
        return null;
      }
    },
    onChange(listener) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(sessionOf(session)));
      return () => data.subscription.unsubscribe();
    },
    async sendCode(email) {
      await guard('send', () => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
    },
    async verifyCode(email, code) {
      await guard('verify', () => supabase.auth.verifyOtp({ email, token: code, type: 'email' }));
    },
    async signOut() {
      await guard('other', () => supabase.auth.signOut());
    },
  };
}
