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

export type AuthErrorCode = 'invalid-email' | 'wrong-code' | 'too-many' | 'unavailable' | 'google-failed';

const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-email': 'Enter an email address like name@example.com.',
  'wrong-code': 'That code is not right, or it has run out. Check the latest email, or ask for a new code.',
  'too-many': 'Too many tries. Wait a few minutes, then try again.',
  unavailable: 'Sign-in is not available right now. Please try again.',
  'google-failed': 'Google sign-in did not work. Please try again, or use your email.',
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
 * Signing in with Google: the service draws Google's button in an element (Google's own, in its own frame,
 * as Google requires), and when the person chooses an account and it works, calls `onSignedIn`. The page
 * is never left. The returned function takes the button away again.
 */
export interface GoogleSignIn {
  renderButton(element: HTMLElement, handlers: { onSignedIn(): void; onError(error: AuthError): void }): Promise<() => void>;
}

/**
 * What a sign-in service has to do for the app: send a one-time code to an email address, sign in with
 * the code, tell who is signed in (and when that changes), and sign out. Supabase is one; a made-up one
 * for development and tests is another.
 */
export interface AuthClient {
  /** Present when signing in with Google is set up. */
  google?: GoogleSignIn;
  getSession(): Promise<AuthSession | null>;
  onChange(listener: (session: AuthSession | null) => void): () => void;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}
