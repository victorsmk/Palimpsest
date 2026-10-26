import { uuidV5 } from '@/lib/models';
import { AuthError, type AuthClient, type AuthSession } from './types';

/** The code the made-up sign-in accepts. It is for development and tests, never for a real deployment. */
export const TEST_CODE = '123456';

const KEY = 'palimpsest:test-session';
const NAMESPACE = '2d7f6c3a-91b4-4e55-8a0c-6f1e3b9d4c21';

/** The user the made-up sign-in makes of an address (the same every time, whatever its case). */
export function testUserId(email: string): string {
  return uuidV5(NAMESPACE, email.trim().toLowerCase());
}

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * A sign-in with no service behind it, for development and tests: any address, and the code 123456. The
 * user is made from the address, so the same address is the same user every time. Its token is the one
 * the server's test sign-in accepts (and the server refuses it in production).
 */
export const GOOGLE_DEMO_EMAIL = 'google-demo@example.com';

export function createTestAuthClient(storage: Storage = window.localStorage): AuthClient {
  const listeners = new Set<(session: AuthSession | null) => void>();
  const read = (): AuthSession | null => {
    try {
      const raw = JSON.parse(storage.getItem(KEY) ?? 'null') as AuthSession | null;
      return raw && typeof raw.token === 'string' && typeof raw.user?.id === 'string' && typeof raw.user.email === 'string' ? raw : null;
    } catch {
      return null;
    }
  };
  const tell = () => {
    const session = read();
    for (const listener of [...listeners]) listener(session);
  };
  const signInAs = (email: string) => {
    const id = testUserId(email);
    storage.setItem(KEY, JSON.stringify({ token: `test-user:${id}`, user: { id, email: email.trim() } } satisfies AuthSession));
    tell();
  };
  return {
    // A stand-in for Google's button, so that the way in through Google can be tried without Google.
    google: {
      async renderButton(element, handlers) {
        const button = element.ownerDocument.createElement('button');
        button.type = 'button';
        button.textContent = 'Continue with Google (demo)';
        button.className =
          'w-full rounded border border-[#DDD5C5] bg-white px-3 py-2 text-sm font-medium text-[#24231F] hover:bg-[#F3EBDD] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';
        button.addEventListener('click', () => {
          signInAs(GOOGLE_DEMO_EMAIL);
          handlers.onSignedIn();
        });
        element.replaceChildren(button);
        return () => element.replaceChildren();
      },
    },
    async getSession() {
      return read();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async sendCode() {},
    async verifyCode(email, code) {
      if (code !== TEST_CODE) throw new AuthError('wrong-code');
      signInAs(email);
    },
    async signOut() {
      storage.removeItem(KEY);
      tell();
    },
  };
}
