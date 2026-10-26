/**
 * Google's sign-in button ("Google Identity Services"): a script from accounts.google.com that draws a button,
 * opens Google's own popup when it is pressed, and hands the page a signed token for the person who chose to
 * sign in. The page never leaves, so a poem in the Studio stays where it is. The token is then given to
 * Supabase, which checks it with Google.
 */

/** The little of the script's interface that is used. */
export interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        nonce?: string;
        ux_mode?: 'popup' | 'redirect';
        auto_select?: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: { type?: 'standard' | 'icon'; theme?: 'outline' | 'filled_blue' | 'filled_black'; size?: 'large' | 'medium' | 'small'; text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'; shape?: 'rectangular' | 'pill'; width?: number; logo_alignment?: 'left' | 'center' }
      ): void;
      cancel?(): void;
    };
  };
}

export const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let loading: Promise<GoogleIdentity> | null = null;

/**
 * Loads Google's script once and gives its interface. A script that cannot be loaded (blocked by a
 * browser extension, or no connection) is an error, and the next call tries again.
 */
export function loadGoogleIdentity(options: { timeoutMs?: number; win?: Window; doc?: Document } = {}): Promise<GoogleIdentity> {
  const win = options.win ?? window;
  const doc = options.doc ?? document;
  if (win.google?.accounts?.id) return Promise.resolve(win.google);
  if (loading) return loading;

  const attempt = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = doc.createElement('script');
    const timer = setTimeout(() => fail(new Error('Google sign-in took too long to load')), options.timeoutMs ?? 10_000);
    const fail = (error: Error) => {
      clearTimeout(timer);
      script.remove();
      reject(error);
    };
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      clearTimeout(timer);
      if (win.google?.accounts?.id) resolve(win.google);
      else fail(new Error('Google sign-in loaded, but not as expected'));
    };
    script.onerror = () => fail(new Error('Google sign-in could not be loaded'));
    doc.head.appendChild(script);
  });
  loading = attempt;
  attempt.catch(() => {
    if (loading === attempt) loading = null;
  });
  return attempt;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * A one-time random value that ties Google's token to this sign-in attempt. Google is given the SHA-256 of
 * it, and Supabase the value itself: Supabase hashes it again and checks that it is the one inside the
 * token, so a token taken from another sign-in is refused.
 */
export async function makeNonce(cryptoApi: Crypto = crypto): Promise<{ raw: string; hashed: string }> {
  const raw = hex(cryptoApi.getRandomValues(new Uint8Array(16)));
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: hex(new Uint8Array(digest)) };
}
