export interface AuthUser {
  id: string;
  email: string;
}

/** A signed-in session: the token to send to the API, and who it is for. */
export interface AuthSession {
  token: string;
  user: AuthUser;
}

export type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: AuthUser };

export type AuthErrorCode = 'invalid-email' | 'wrong-code' | 'too-many' | 'unavailable';

const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-email': 'Enter an email address like name@example.com.',
  'wrong-code': 'That code is not right, or it has run out. Check the latest email, or ask for a new code.',
  'too-many': 'Too many tries. Wait a few minutes, then try again.',
  unavailable: 'Sign-in is not available right now. Please try again.',
};

/** Why a sign-in step did not work, in words fit to show the writer. */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
    options?: { cause?: unknown }
  ) {
    super(message ?? MESSAGES[code], options);
    this.name = 'AuthError';
  }
}

/**
 * What a sign-in service has to do for the app: send a one-time code to an email address, sign in with
 * the code, tell who is signed in (and when that changes), and sign out. Supabase is one; a made-up one
 * for development and tests is another.
 */
export interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  onChange(listener: (session: AuthSession | null) => void): () => void;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}
