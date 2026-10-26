import { AuthError, type AuthClient, type AuthSession, type AuthState } from './types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6,10}$/;

/**
 * What the screens and the data layer know about who is signed in. It holds the state (loading until the
 * sign-in service has said, then signed in or out), lets a screen follow it, hands the data layer the token
 * to send (waiting for the first answer, so a request made while the page is still starting is not sent
 * as if nobody were signed in), and checks what a person types before the service is asked.
 */
export class AuthManager {
  private state: AuthState = { status: 'loading' };
  private listeners = new Set<() => void>();

  constructor(private clientPromise: Promise<AuthClient>) {
    void clientPromise.then(
      async client => {
        client.onChange(session => this.set(session));
        this.set(await client.getSession());
      },
      () => this.set(null)
    );
  }

  private set(session: AuthSession | null) {
    const next: AuthState = session ? { status: 'signed-in', user: session.user } : { status: 'signed-out' };
    const same =
      next.status === this.state.status &&
      (next.status !== 'signed-in' || (this.state.status === 'signed-in' && this.state.user.id === next.user.id && this.state.user.email === next.user.email));
    if (same) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }

  /** The current state. The same object until it changes, so a screen can follow it cheaply. */
  getState = (): AuthState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The token to send with a request, or null when nobody is signed in. Waits for the sign-in service to be ready, so a page that is still starting is not taken for nobody signed in. */
  async getToken(): Promise<string | null> {
    try {
      return (await (await this.clientPromise).getSession())?.token ?? null;
    } catch {
      return null;
    }
  }

  private async client(): Promise<AuthClient> {
    try {
      return await this.clientPromise;
    } catch (cause) {
      throw new AuthError('unavailable', 'Sign-in is not set up yet.', { cause });
    }
  }

  /** Asks for a one-time code to be emailed. */
  async sendCode(email: string): Promise<void> {
    const address = email.trim();
    if (address.length > 254 || !EMAIL.test(address)) throw new AuthError('invalid-email');
    await (await this.client()).sendCode(address);
  }

  /** Signs in with the code from the email. Spaces in it (as people copy it) do not matter. */
  async verifyCode(email: string, code: string): Promise<void> {
    const digits = code.replace(/\s+/g, '');
    if (!CODE.test(digits)) throw new AuthError('wrong-code');
    const client = await this.client();
    await client.verifyCode(email.trim(), digits);
    // The service tells us through onChange; read it again too, so the state is right when this returns.
    this.set(await client.getSession());
  }

  async signOut(): Promise<void> {
    const client = await this.client();
    await client.signOut();
    this.set(null);
  }
}
