// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createHash } from 'node:crypto';
import { GOOGLE_SCRIPT_URL, loadGoogleIdentity, makeNonce, type GoogleIdentity } from '@/lib/auth/googleIdentity';
import { authErrorOf, createSupabaseAuthClient, googleErrorOf, type SupabaseLike } from '@/lib/auth/supabaseClient';
import { createTestAuthClient, GOOGLE_DEMO_EMAIL, TEST_CODE, testUserId } from '@/lib/auth/testClient';
import { AuthManager } from '@/lib/auth/AuthManager';
import { AuthError, type AuthClient, type AuthSession, type GoogleSignIn } from '@/lib/auth/types';
import { SignInDialog } from '@/components/SignInDialog';
import { emailSignInEnabled } from '@/lib/auth/runtime';
import { MemoryStorageAdapter } from '@/lib/repositories';
import { click, render } from '../helpers/react';

// Signing in with Google: Google's script and its button, the nonce, the hand-over of Google's token to
// Supabase, the stand-in for the demo, and the sign-in dialog around it. (The real Google, and Supabase's
// real checking of its token, cannot be tried here: see DEPLOYMENT.md.)

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const settled = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  delete (window as { google?: unknown }).google;
});

describe('Google’s script', () => {
  // The loader keeps the script it is loading in a module variable: each test gets a fresh copy of the module.
  const freshLoader = async () => (await vi.importActual<typeof import('@/lib/auth/googleIdentity')>('@/lib/auth/googleIdentity')).loadGoogleIdentity;
  const fakeGoogle = (): GoogleIdentity => ({ accounts: { id: { initialize: vi.fn(), renderButton: vi.fn(), cancel: vi.fn() } } });
  const scripts = () => [...document.head.querySelectorAll('script')];

  it('is not loaded again when it is already there', async () => {
    const google = fakeGoogle();
    (window as { google?: GoogleIdentity }).google = google;
    expect(await loadGoogleIdentity()).toBe(google);
    expect(scripts()).toHaveLength(0);
  });

  it('is added to the page once, however many ask, and resolves when it has loaded', async () => {
    vi.resetModules();
    const load = await freshLoader();
    const first = load();
    const second = load();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toBe(GOOGLE_SCRIPT_URL);
    expect(scripts()[0].async).toBe(true);
    const google = fakeGoogle();
    (window as { google?: GoogleIdentity }).google = google;
    scripts()[0].onload?.(new Event('load'));
    expect(await first).toBe(google);
    expect(await second).toBe(google);
  });

  it('is an error when it cannot be loaded, takes its tag away again, and is tried again next time', async () => {
    vi.resetModules();
    const load = await freshLoader();
    const failing = load();
    scripts()[0].onerror?.(new Event('error'));
    await expect(failing).rejects.toThrow('could not be loaded');
    expect(scripts()).toHaveLength(0);

    const retry = load();
    expect(scripts()).toHaveLength(1);
    (window as { google?: GoogleIdentity }).google = fakeGoogle();
    scripts()[0].onload?.(new Event('load'));
    await expect(retry).resolves.toBeDefined();
  });

  it('is an error when it loads but is not what was expected', async () => {
    vi.resetModules();
    const load = await freshLoader();
    const odd = load();
    scripts()[0].onload?.(new Event('load'));
    await expect(odd).rejects.toThrow('not as expected');
  });

  it('is an error when it takes too long', async () => {
    vi.resetModules();
    const load = await freshLoader();
    vi.useFakeTimers();
    const slow = load({ timeoutMs: 500 });
    const caught = slow.catch(e => e);
    await vi.advanceTimersByTimeAsync(600);
    expect(((await caught) as Error).message).toContain('too long');
    vi.useRealTimers();
    expect(scripts()).toHaveLength(0);
  });
});

describe('the nonce', () => {
  it('is random, 32 characters, and Google gets its SHA-256 while Supabase gets the value itself', async () => {
    const { raw, hashed } = await makeNonce();
    expect(raw).toMatch(/^[0-9a-f]{32}$/);
    expect(hashed).toBe(sha256(raw));
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is new every time', async () => {
    const all = new Set((await Promise.all(Array.from({ length: 20 }, () => makeNonce()))).map(n => n.raw));
    expect(all.size).toBe(20);
  });
});

describe('Google sign-in through Supabase', () => {
  function setup(answers: { idToken?: unknown; throws?: boolean } = {}) {
    const idTokenCalls: unknown[] = [];
    const supabase: SupabaseLike = {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithOtp: async () => ({ error: null }),
        verifyOtp: async () => ({ error: null }),
        signInWithIdToken: async args => {
          idTokenCalls.push(args);
          if (answers.throws) throw new TypeError('fetch failed');
          return { error: (answers.idToken as never) ?? null };
        },
        signOut: async () => ({ error: null }),
      },
    };
    let config: Parameters<GoogleIdentity['accounts']['id']['initialize']>[0] | undefined;
    const rendered: { parent: HTMLElement; options: unknown }[] = [];
    const cancel = vi.fn();
    const identity: GoogleIdentity = {
      accounts: {
        id: {
          initialize: c => {
            config = c;
          },
          renderButton: (parent, options) => {
            rendered.push({ parent, options });
            parent.append(document.createElement('iframe'));
          },
          cancel,
        },
      },
    };
    const client = createSupabaseAuthClient(supabase, { google: { clientId: 'client-id.apps.googleusercontent.com', load: async () => identity, nonce: async () => ({ raw: 'raw-nonce', hashed: 'hashed-nonce' }) } });
    return { client, idTokenCalls, rendered, cancel, config: () => config! };
  }
  const handlers = () => ({ onSignedIn: vi.fn(), onError: vi.fn() });

  it('has no Google button unless a Google client id is given', () => {
    expect(setup().client.google).toBeDefined();
    const bare = createSupabaseAuthClient({} as SupabaseLike);
    expect(bare.google).toBeUndefined();
  });

  it('gives Google the client id and the hashed nonce, a popup rather than a redirect, and no automatic sign-in', async () => {
    const f = setup();
    await f.client.google!.renderButton(document.createElement('div'), handlers());
    expect(f.config()).toMatchObject({ client_id: 'client-id.apps.googleusercontent.com', nonce: 'hashed-nonce', ux_mode: 'popup', auto_select: false });
  });

  it('asks Google to draw its button where it was told', async () => {
    const f = setup();
    const box = document.createElement('div');
    await f.client.google!.renderButton(box, handlers());
    expect(f.rendered).toHaveLength(1);
    expect(f.rendered[0].parent).toBe(box);
    expect(f.rendered[0].options).toMatchObject({ type: 'standard', text: 'continue_with' });
    expect(box.querySelector('iframe')).not.toBeNull();
  });

  it('hands Google’s token to Supabase with the raw nonce, and says so when Supabase accepts it', async () => {
    const f = setup();
    const h = handlers();
    await f.client.google!.renderButton(document.createElement('div'), h);
    await f.config().callback({ credential: 'google.id.token' });
    expect(f.idTokenCalls).toEqual([{ provider: 'google', token: 'google.id.token', nonce: 'raw-nonce' }]);
    expect(h.onSignedIn).toHaveBeenCalledOnce();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('does not ask Supabase anything when Google gave no token', async () => {
    const f = setup();
    const h = handlers();
    await f.client.google!.renderButton(document.createElement('div'), h);
    await f.config().callback({});
    expect(f.idTokenCalls).toEqual([]);
    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.onError.mock.calls[0][0]).toMatchObject({ code: 'google-failed' });
    expect(h.onSignedIn).not.toHaveBeenCalled();
  });

  it('says Google sign-in did not work when Supabase refuses the token, and to wait when it is asked too often', async () => {
    const refused = setup({ idToken: { status: 400, code: 'validation_failed', message: 'Nonces mismatch' } });
    const h1 = handlers();
    await refused.client.google!.renderButton(document.createElement('div'), h1);
    await refused.config().callback({ credential: 't' });
    expect(h1.onError.mock.calls[0][0]).toMatchObject({ code: 'google-failed', message: 'Google sign-in did not work. Please try again, or use your email.' });

    const busy = setup({ idToken: { status: 429 } });
    const h2 = handlers();
    await busy.client.google!.renderButton(document.createElement('div'), h2);
    await busy.config().callback({ credential: 't' });
    expect(h2.onError.mock.calls[0][0]).toMatchObject({ code: 'too-many' });
    expect(h2.onSignedIn).not.toHaveBeenCalled();
  });

  it('says sign-in is unavailable when Supabase cannot be reached', async () => {
    const f = setup({ throws: true });
    const h = handlers();
    await f.client.google!.renderButton(document.createElement('div'), h);
    await f.config().callback({ credential: 't' });
    expect(h.onError.mock.calls[0][0]).toMatchObject({ code: 'unavailable' });
  });

  it('fails with the Google message when Google’s script cannot be loaded', async () => {
    const client = createSupabaseAuthClient({} as SupabaseLike, { google: { clientId: 'x', load: async () => Promise.reject(new Error('blocked')) } });
    await expect(client.google!.renderButton(document.createElement('div'), handlers())).rejects.toMatchObject({ code: 'google-failed' });
  });

  it('takes its button away, and tells Google to stop, when asked', async () => {
    const f = setup();
    const box = document.createElement('div');
    const remove = await f.client.google!.renderButton(box, handlers());
    expect(box.children).toHaveLength(1);
    remove();
    expect(box.children).toHaveLength(0);
    expect(f.cancel).toHaveBeenCalled();
  });

  it('uses a new nonce for each button', async () => {
    const idTokenCalls: { nonce?: string }[] = [];
    const nonces = [{ raw: 'one', hashed: 'H1' }, { raw: 'two', hashed: 'H2' }];
    const configs: { nonce?: string }[] = [];
    const identity: GoogleIdentity = { accounts: { id: { initialize: c => configs.push(c), renderButton: () => {} } } };
    const supabase = { auth: { signInWithIdToken: async (a: { nonce?: string }) => (idTokenCalls.push(a), { error: null }) } } as unknown as SupabaseLike;
    const client = createSupabaseAuthClient(supabase, { google: { clientId: 'x', load: async () => identity, nonce: async () => nonces.shift()! } });
    await client.google!.renderButton(document.createElement('div'), handlers());
    await client.google!.renderButton(document.createElement('div'), handlers());
    expect(configs.map(c => c.nonce)).toEqual(['H1', 'H2']);
  });

  it('the error mapping is its own: a Google refusal is not a wrong email code', () => {
    expect(googleErrorOf({ status: 400 }).code).toBe('google-failed');
    expect(authErrorOf({ status: 400 }, 'verify').code).toBe('wrong-code');
    expect(googleErrorOf({ code: 'over_request_rate_limit' }).code).toBe('too-many');
    expect(googleErrorOf({ message: 'Rate limit exceeded' }).code).toBe('too-many');
  });
});

describe('the stand-in for Google, in the demo', () => {
  it('draws a button of its own that signs in as the demo Google user and says so', async () => {
    const client = createTestAuthClient(new MemoryStorageAdapter());
    const box = document.createElement('div');
    const h = { onSignedIn: vi.fn(), onError: vi.fn() };
    const remove = await client.google!.renderButton(box, h);
    const button = box.querySelector('button')!;
    expect(button.textContent).toBe('Continue with Google (demo)');
    expect(await client.getSession()).toBeNull();
    button.click();
    expect(h.onSignedIn).toHaveBeenCalledOnce();
    expect((await client.getSession())?.user.email).toBe(GOOGLE_DEMO_EMAIL);
    remove();
    expect(box.children).toHaveLength(0);
  });

  it('is the same user as the same address by email code, as Supabase links them', async () => {
    const storage = new MemoryStorageAdapter();
    const viaGoogle = createTestAuthClient(storage);
    const box = document.createElement('div');
    await viaGoogle.google!.renderButton(box, { onSignedIn() {}, onError() {} });
    box.querySelector('button')!.click();
    const googleId = (await viaGoogle.getSession())!.user.id;
    await viaGoogle.signOut();
    await viaGoogle.verifyCode(GOOGLE_DEMO_EMAIL, TEST_CODE);
    expect((await viaGoogle.getSession())!.user.id).toBe(googleId);
    expect(googleId).toBe(testUserId(GOOGLE_DEMO_EMAIL));
  });
});

describe('AuthManager and Google', () => {
  const me: AuthSession = { token: 't', user: { id: 'u', email: 'me@example.org' } };
  function clientWith(google: GoogleSignIn | undefined, session: () => AuthSession | null): AuthClient {
    return {
      google,
      getSession: async () => session(),
      onChange: () => () => {},
      sendCode: async () => {},
      verifyCode: async () => {},
      signOut: async () => {},
    };
  }

  it('has none when the service has none, or when there is no service', async () => {
    expect(await new AuthManager(Promise.resolve(clientWith(undefined, () => null))).googleSignIn()).toBeNull();
    expect(await new AuthManager(Promise.reject(new Error('not set up'))).googleSignIn()).toBeNull();
  });

  it('has the state right by the time the person is told they are signed in', async () => {
    let signedIn = false;
    let handlersGiven: Parameters<GoogleSignIn['renderButton']>[1] | undefined;
    const google: GoogleSignIn = { renderButton: async (_el, h) => { handlersGiven = h; return () => {}; } };
    const manager = new AuthManager(Promise.resolve(clientWith(google, () => (signedIn ? me : null))));
    await settled();
    const found = (await manager.googleSignIn())!;
    await found.renderButton(document.createElement('div'), {
      onSignedIn: () => expect(manager.getState()).toEqual({ status: 'signed-in', user: me.user }),
      onError: () => {},
    });
    signedIn = true;
    handlersGiven!.onSignedIn();
    await settled();
    expect(manager.getState()).toEqual({ status: 'signed-in', user: me.user });
  });

  it('passes an error on as it is', async () => {
    const error = new AuthError('google-failed');
    const google: GoogleSignIn = { renderButton: async (_el, h) => (h.onError(error), () => {}) };
    const manager = new AuthManager(Promise.resolve(clientWith(google, () => null)));
    const onError = vi.fn();
    await (await manager.googleSignIn())!.renderButton(document.createElement('div'), { onSignedIn() {}, onError });
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('the email sign-in setting', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is on unless NEXT_PUBLIC_EMAIL_SIGN_IN is "off", in any case and with spaces', () => {
    expect(emailSignInEnabled()).toBe(true);
    for (const value of ['', 'on', '1', 'false', 'no']) {
      vi.stubEnv('NEXT_PUBLIC_EMAIL_SIGN_IN', value);
      expect(emailSignInEnabled(), value).toBe(true);
    }
    for (const value of ['off', 'OFF', ' Off ']) {
      vi.stubEnv('NEXT_PUBLIC_EMAIL_SIGN_IN', value);
      expect(emailSignInEnabled(), value).toBe(false);
    }
  });

  it('is what the dialog follows when it is not told', async () => {
    vi.stubEnv('NEXT_PUBLIC_EMAIL_SIGN_IN', 'off');
    render(createElement(SignInDialog, { manager: { googleSignIn: async () => null } as unknown as AuthManager, onClose: vi.fn() }));
    await settled();
    await settled();
    expect(document.querySelector('input')).toBeNull();
  });
});

describe('the sign-in dialog', () => {
  function manager(google: GoogleSignIn | null) {
    return {
      googleSignIn: async () => google,
      sendCode: vi.fn(async () => {}),
      verifyCode: vi.fn(async () => {}),
    } as unknown as AuthManager;
  }
  function googleButton() {
    const state = { handlers: undefined as Parameters<GoogleSignIn['renderButton']>[1] | undefined, removed: 0, rendered: 0 };
    const google: GoogleSignIn = {
      renderButton: async (element, handlers) => {
        state.handlers = handlers;
        state.rendered++;
        const button = document.createElement('button');
        button.textContent = 'Google button';
        element.append(button);
        return () => {
          state.removed++;
          button.remove();
        };
      },
    };
    return { google, state };
  }
  const text = () => document.body.textContent ?? '';

  it('shows Google’s button above the email form, with "or" between, when Google sign-in is set up', async () => {
    const { google } = googleButton();
    render(createElement(SignInDialog, { manager: manager(google), onClose: vi.fn() }));
    await settled();
    await settled();
    expect(document.querySelector('[role=dialog]')!.textContent).toContain('Google button');
    expect(text()).toContain('or');
    const dialog = document.querySelector('[role=dialog]')!;
    const html = dialog.innerHTML;
    expect(html.indexOf('Google button')).toBeLessThan(html.indexOf('Email address'));
  });

  it('links to the privacy page in a new tab, so that an unsaved poem on this page is not lost', async () => {
    render(createElement(SignInDialog, { manager: manager(null), onClose: vi.fn() }));
    await settled();
    const link = [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/privacy')!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows nothing about Google when it is not set up', async () => {
    render(createElement(SignInDialog, { manager: manager(null), onClose: vi.fn() }));
    await settled();
    await settled();
    expect(text()).not.toContain('Google');
    expect(document.querySelectorAll('[aria-hidden=true]')).toHaveLength(1); // only the close mark
  });

  it('signs in when Google does, and closes after telling the page', async () => {
    const { google, state } = googleButton();
    const onClose = vi.fn();
    const onSignedIn = vi.fn();
    render(createElement(SignInDialog, { manager: manager(google), onClose, onSignedIn }));
    await settled();
    await settled();
    state.handlers!.onSignedIn();
    expect(onSignedIn).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows what went wrong, in the dialog, when Google sign-in fails', async () => {
    const { google, state } = googleButton();
    render(createElement(SignInDialog, { manager: manager(google), onClose: vi.fn() }));
    await settled();
    await settled();
    await act(async () => state.handlers!.onError(new AuthError('google-failed')));
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Google sign-in did not work. Please try again, or use your email.');
  });

  it('shows the error if the button cannot be drawn (Google’s script blocked)', async () => {
    const google: GoogleSignIn = { renderButton: async () => { throw new AuthError('google-failed'); } };
    render(createElement(SignInDialog, { manager: manager(google), onClose: vi.fn() }));
    await settled();
    await settled();
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Google sign-in did not work');
  });

  describe('with email sign-in off (Google only)', () => {
    const open = async (google: GoogleSignIn | null, onClose = vi.fn()) => {
      render(createElement(SignInDialog, { manager: manager(google), onClose, emailSignIn: false }));
      await settled();
      await settled();
    };

    it('shows Google’s button alone: no email field, no "Send code", no "or"', async () => {
      const { google } = googleButton();
      await open(google);
      const dialog = document.querySelector('[role=dialog]')!;
      expect(dialog.textContent).toContain('Google button');
      expect(dialog.querySelector('input')).toBeNull();
      expect(dialog.textContent).not.toContain('Send code');
      expect(dialog.textContent).not.toContain('Email address');
      expect(dialog.textContent).not.toMatch(/\bor\b/);
    });

    it('still signs in through Google and closes', async () => {
      const { google, state } = googleButton();
      const onClose = vi.fn();
      await open(google, onClose);
      state.handlers!.onSignedIn();
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not send people to an email form that is not there when Google fails', async () => {
      const { google, state } = googleButton();
      await open(google);
      await act(async () => state.handlers!.onError(new AuthError('google-failed')));
      expect(document.querySelector('[role=alert]')?.textContent).toBe('Google sign-in did not work. Please try again.');
    });

    it('says sign-in is not available, and can be cancelled, when Google is not set up either', async () => {
      const onClose = vi.fn();
      await open(null, onClose);
      expect(document.querySelector('[role=alert]')?.textContent).toBe('Sign-in is not available right now.');
      click([...document.querySelectorAll('button')].find(b => b.textContent === 'Cancel'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not say so while it is still finding out whether Google is set up', async () => {
      const never = { googleSignIn: () => new Promise(() => {}) } as unknown as AuthManager;
      render(createElement(SignInDialog, { manager: never, onClose: vi.fn(), emailSignIn: false }));
      await settled();
      expect(document.querySelector('[role=alert]')).toBeNull();
    });
  });

  it('takes the button away when the code step comes, and puts it back on the way back', async () => {
    const { google, state } = googleButton();
    render(createElement(SignInDialog, { manager: manager(google), onClose: vi.fn() }));
    await settled();
    await settled();
    const input = document.querySelector<HTMLInputElement>('input[type=email]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'me@example.org');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click([...document.querySelectorAll('button')].find(b => b.textContent === 'Send code'));
    await settled();
    await settled();
    expect(state.removed).toBe(1);
    expect(text()).not.toContain('Google button');
    click([...document.querySelectorAll('button')].find(b => b.textContent === 'Use another address'));
    await settled();
    await settled();
    expect(state.rendered).toBe(2);
    expect(text()).toContain('Google button');
  });
});
