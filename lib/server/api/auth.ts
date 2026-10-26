import { UnauthorizedError, UnavailableError } from '@/lib/models';

/** Who is asking: the user's id, or an UnauthorizedError. */
export type Authenticator = (request: Request) => Promise<string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The token in an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null;
  return match ? match[1] : null;
}

/**
 * Asks Supabase who a sign-in token belongs to: its own endpoint (`GET /auth/v1/user`), given the
 * token and the project's public key. Supabase says no if the token is wrong, expired or signed out.
 * Nothing the browser says about who it is counts for anything but the token.
 */
export function supabaseAuthenticator(options: { url: string; anonKey: string; fetch?: typeof fetch }): Authenticator {
  const doFetch = options.fetch ?? fetch;
  return async request => {
    const token = bearerToken(request);
    if (!token) throw new UnauthorizedError();
    let response: Response;
    try {
      response = await doFetch(`${options.url}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: options.anonKey },
        cache: 'no-store',
      });
    } catch (cause) {
      throw new UnavailableError({ cause });
    }
    if (response.status === 401 || response.status === 403) throw new UnauthorizedError();
    if (!response.ok) throw new UnavailableError({ cause: new Error(`Supabase answered ${response.status}`) });
    const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
    if (typeof user?.id !== 'string' || !UUID.test(user.id)) throw new UnavailableError({ cause: new Error('Supabase gave no user id') });
    return user.id;
  };
}

/**
 * A sign-in for development and tests only: the token is "test-user:" and a UUID, and that UUID is the
 * user. Anyone can make one, so the configuration refuses it in production (see config.ts).
 */
export function testAuthenticator(): Authenticator {
  return async request => {
    const token = bearerToken(request);
    const match = token ? /^test-user:([0-9a-f-]{36})$/.exec(token) : null;
    if (!match || !UUID.test(match[1])) throw new UnauthorizedError();
    return match[1];
  };
}
