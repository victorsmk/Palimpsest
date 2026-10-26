import { describe, it, expect, vi } from 'vitest';
import { AuthManager } from '@/lib/auth/AuthManager';
import { createTestAuthClient, TEST_CODE } from '@/lib/auth/testClient';
import { createSupabaseAuthClient, authErrorOf, type SupabaseLike } from '@/lib/auth/supabaseClient';
import { createAuthClient } from '@/lib/auth/runtime';
import { AuthError, type AuthClient, type AuthSession } from '@/lib/auth/types';
import { MemoryStorageAdapter } from '@/lib/repositories';
import { session, setSessionSource } from '@/lib/auth/session';

const ME: AuthSession = { token: 'token-1', user: { id: 'u1', email: 'me@example.org' } };

/** A sign-in service that keeps its session in a variable, and says when it changes. */
function fakeClient(initial: AuthSession | null = null) {
  let current = initial;
  const listeners = new Set<(session: AuthSession | null) => void>();
  const calls: string[] = [];
  const client: AuthClient = {
    getSession: vi.fn(async () => current),
    onChange: l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    sendCode: vi.fn(async (email: string) => void calls.push(`send ${email}`)),
    verifyCode: vi.fn(async (email: string, code: string) => {
      calls.push(`verify ${email} ${code}`);
      current = ME;
      for (const l of listeners) l(current);
    }),
    signOut: vi.fn(async () => {
      calls.push('signout');
      current = null;
      for (const l of listeners) l(null);
    }),
  };
  return { client, calls, listeners, set: (next: AuthSession | null) => { current = next; for (const l of listeners) l(next); } };
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0));

describe('AuthManager', () => {
  it('is loading until the service has answered, then signed out or signed in', async () => {
    const out = new AuthManager(Promise.resolve(fakeClient().client));
    expect(out.getState()).toEqual({ status: 'loading' });
    await settled();
    expect(out.getState()).toEqual({ status: 'signed-out' });

    const inn = new AuthManager(Promise.resolve(fakeClient(ME).client));
    await settled();
    expect(inn.getState()).toEqual({ status: 'signed-in', user: ME.user });
  });

  it('keeps the same state object until something changes, and tells followers only of a change', async () => {
    const f = fakeClient();
    const manager = new AuthManager(Promise.resolve(f.client));
    await settled();
    const listener = vi.fn();
    const stop = manager.subscribe(listener);
    const before = manager.getState();
    f.set(null); // still signed out
    expect(manager.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    f.set(ME);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.getState()).toEqual({ status: 'signed-in', user: ME.user });
    f.set(ME);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    f.set(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hands out the token only once the service has answered, never "nobody" for a page that is still starting', async () => {
    let release!: (client: AuthClient) => void;
    const manager = new AuthManager(new Promise<AuthClient>(resolve => (release = resolve)));
    let token: string | null | undefined;
    void manager.getToken().then(t => (token = t));
    await settled();
    expect(token).toBeUndefined();
    release(fakeClient(ME).client);
    await settled();
    expect(token).toBe('token-1');
  });

  it('reads the token fresh each time, so a renewed one is used', async () => {
    const f = fakeClient(ME);
    const manager = new AuthManager(Promise.resolve(f.client));
    expect(await manager.getToken()).toBe('token-1');
    f.set({ ...ME, token: 'token-2' });
    expect(await manager.getToken()).toBe('token-2');
    f.set(null);
    expect(await manager.getToken()).toBeNull();
  });

  describe('asking for a code', () => {
    it('trims the address and asks the service', async () => {
      const f = fakeClient();
      await new AuthManager(Promise.resolve(f.client)).sendCode('  me@example.org ');
      expect(f.calls).toEqual(['send me@example.org']);
    });

    it.each(['', ' ', 'me', 'me@', '@example.org', 'me@example', 'me @example.org', 'me@exa mple.org', 'a@b@c.org', `${'a'.repeat(250)}@example.org`])('refuses %j without asking the service', async address => {
      const f = fakeClient();
      const caught = await new AuthManager(Promise.resolve(f.client)).sendCode(address).catch(e => e);
      expect(caught).toBeInstanceOf(AuthError);
      expect(caught.code).toBe('invalid-email');
      expect(caught.message).toBe('Enter an email address like name@example.com.');
      expect(f.calls).toEqual([]);
    });
  });

  describe('signing in with a code', () => {
    it('takes the digits, however they were copied (spaces and all), and is signed in when it returns', async () => {
      const f = fakeClient();
      const manager = new AuthManager(Promise.resolve(f.client));
      await manager.verifyCode(' me@example.org ', ' 123 456\n');
      expect(f.calls).toEqual(['verify me@example.org 123456']);
      expect(manager.getState()).toEqual({ status: 'signed-in', user: ME.user });
    });

    it.each(['', '12345', '12345a', 'abcdef', '12-3456', '12345678901'])('refuses %j as a code without asking the service', async code => {
      const f = fakeClient();
      const caught = await new AuthManager(Promise.resolve(f.client)).verifyCode('me@example.org', code).catch(e => e);
      expect(caught).toMatchObject({ code: 'wrong-code' });
      expect(f.calls).toEqual([]);
    });

    it('accepts codes of 6 to 10 digits', async () => {
      for (const code of ['123456', '1234567', '12345678', '123456789', '1234567890']) {
        const f = fakeClient();
        await new AuthManager(Promise.resolve(f.client)).verifyCode('me@example.org', code);
        expect(f.calls).toEqual([`verify me@example.org ${code}`]);
      }
    });

    it('passes on what the service says when the code is wrong, and is still signed out', async () => {
      const f = fakeClient();
      (f.client.verifyCode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new AuthError('wrong-code'));
      const manager = new AuthManager(Promise.resolve(f.client));
      await settled();
      await expect(manager.verifyCode('me@example.org', '000000')).rejects.toMatchObject({ code: 'wrong-code' });
      expect(manager.getState()).toEqual({ status: 'signed-out' });
    });
  });

  it('signs out', async () => {
    const f = fakeClient(ME);
    const manager = new AuthManager(Promise.resolve(f.client));
    await settled();
    await manager.signOut();
    expect(manager.getState()).toEqual({ status: 'signed-out' });
    expect(f.calls).toEqual(['signout']);
  });

  describe('signing out when the service fails to say goodbye', () => {
    it('is signed out all the same if the session is gone from this browser (the account may already be deleted)', async () => {
      const f = fakeClient(ME);
      const manager = new AuthManager(Promise.resolve(f.client));
      await settled();
      (f.client.signOut as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        f.set(null);
        throw new AuthError('unavailable');
      });
      await expect(manager.signOut()).resolves.toBeUndefined();
      expect(manager.getState()).toEqual({ status: 'signed-out' });
    });

    it('says so, and stays signed in, if the session is still there', async () => {
      const f = fakeClient(ME);
      const manager = new AuthManager(Promise.resolve(f.client));
      await settled();
      (f.client.signOut as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new AuthError('unavailable'));
      await expect(manager.signOut()).rejects.toMatchObject({ code: 'unavailable' });
      expect(manager.getState()).toEqual({ status: 'signed-in', user: ME.user });
    });
  });

  describe('when there is no sign-in service (not set up)', () => {
    const manager = () => new AuthManager(Promise.reject(new Error('not set up')));

    it('is signed out, and has no token', async () => {
      const m = manager();
      await settled();
      expect(m.getState()).toEqual({ status: 'signed-out' });
      expect(await m.getToken()).toBeNull();
    });

    it('says plainly that sign-in is not set up, for every step', async () => {
      const m = manager();
      await settled();
      for (const step of [() => m.sendCode('me@example.org'), () => m.verifyCode('me@example.org', '123456'), () => m.signOut()]) {
        await expect(step()).rejects.toMatchObject({ code: 'unavailable', message: 'Sign-in is not set up yet.' });
      }
    });
  });
});

describe('the made-up sign-in', () => {
  const storage = () => new MemoryStorageAdapter();

  it('signs any address in with the one code, as a user the server’s test sign-in knows', async () => {
    const client = createTestAuthClient(storage());
    expect(await client.getSession()).toBeNull();
    await client.verifyCode('Me@Example.org', TEST_CODE);
    const session = (await client.getSession())!;
    expect(session.user.email).toBe('Me@Example.org');
    expect(session.token).toBe(`test-user:${session.user.id}`);
    expect(session.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('refuses any other code', async () => {
    const client = createTestAuthClient(storage());
    await expect(client.verifyCode('me@example.org', '654321')).rejects.toMatchObject({ code: 'wrong-code' });
    expect(await client.getSession()).toBeNull();
  });

  it('makes the same user from the same address, whatever its case, and different users from different ones', async () => {
    const id = async (email: string) => {
      const client = createTestAuthClient(storage());
      await client.verifyCode(email, TEST_CODE);
      return (await client.getSession())!.user.id;
    };
    expect(await id('me@example.org')).toBe(await id('ME@example.ORG'));
    expect(await id('me@example.org')).not.toBe(await id('you@example.org'));
  });

  it('keeps the session across page loads, and forgets it on sign-out', async () => {
    const shared = storage();
    await createTestAuthClient(shared).verifyCode('me@example.org', TEST_CODE);
    const later = createTestAuthClient(shared);
    expect((await later.getSession())?.user.email).toBe('me@example.org');
    await later.signOut();
    expect(await createTestAuthClient(shared).getSession()).toBeNull();
  });

  it('tells followers of a change, until they stop', async () => {
    const client = createTestAuthClient(storage());
    const seen: (string | null)[] = [];
    const stop = client.onChange(s => seen.push(s?.user.email ?? null));
    await client.verifyCode('me@example.org', TEST_CODE);
    await client.signOut();
    stop();
    await client.verifyCode('me@example.org', TEST_CODE);
    expect(seen).toEqual(['me@example.org', null]);
  });

  it('takes damaged or foreign stored data as nobody signed in', async () => {
    for (const junk of ['not json', '{}', '{"token":5}', '{"token":"t","user":{}}', 'null', '[]']) {
      const shared = storage();
      shared.setItem('palimpsest:test-session', junk);
      expect(await createTestAuthClient(shared).getSession()).toBeNull();
    }
  });
});

describe('Supabase sign-in', () => {
  function fakeSupabase() {
    const calls: unknown[][] = [];
    let listener: ((event: string, session: unknown) => void) | undefined;
    const answers = { session: null as unknown, send: null as unknown, verify: null as unknown, out: null as unknown, throws: false };
    const maybeThrow = () => {
      if (answers.throws) throw new TypeError('fetch failed');
    };
    const supabase: SupabaseLike = {
      auth: {
        getSession: async () => (maybeThrow(), { data: { session: answers.session as never }, error: null }),
        onAuthStateChange: cb => {
          listener = cb as never;
          return { data: { subscription: { unsubscribe: () => calls.push(['unsubscribe']) } } };
        },
        signInWithOtp: async args => (calls.push(['otp', args]), maybeThrow(), { error: answers.send as never }),
        verifyOtp: async args => (calls.push(['verify', args]), maybeThrow(), { error: answers.verify as never }),
        signInWithIdToken: async args => (calls.push(['idtoken', args]), maybeThrow(), { error: answers.send as never }),
        signOut: async () => (calls.push(['signout']), maybeThrow(), { error: answers.out as never }),
      },
    };
    return { supabase, calls, answers, emit: (event: string, s: unknown) => listener?.(event, s) };
  }

  it('asks for a code to be emailed, making the account on the first sign-in', async () => {
    const f = fakeSupabase();
    await createSupabaseAuthClient(f.supabase).sendCode('me@example.org');
    expect(f.calls).toEqual([['otp', { email: 'me@example.org', options: { shouldCreateUser: true } }]]);
  });

  it('signs in with the code as an email code', async () => {
    const f = fakeSupabase();
    await createSupabaseAuthClient(f.supabase).verifyCode('me@example.org', '123456');
    expect(f.calls).toEqual([['verify', { email: 'me@example.org', token: '123456', type: 'email' }]]);
  });

  it('reads the session as the token and who it is for', async () => {
    const f = fakeSupabase();
    f.answers.session = { access_token: 'jwt', user: { id: 'u1', email: 'me@example.org' } };
    expect(await createSupabaseAuthClient(f.supabase).getSession()).toEqual({ token: 'jwt', user: { id: 'u1', email: 'me@example.org' } });
    f.answers.session = { access_token: 'jwt', user: { id: 'u1' } };
    expect((await createSupabaseAuthClient(f.supabase).getSession())?.user.email).toBe('');
    for (const none of [null, { access_token: '', user: { id: 'u1' } }, { access_token: 'jwt', user: { id: '' } }]) {
      f.answers.session = none;
      expect(await createSupabaseAuthClient(f.supabase).getSession()).toBeNull();
    }
  });

  it('takes a failure to read the session as nobody signed in', async () => {
    const f = fakeSupabase();
    f.answers.throws = true;
    expect(await createSupabaseAuthClient(f.supabase).getSession()).toBeNull();
  });

  it('tells followers when the session changes, and stops when asked', () => {
    const f = fakeSupabase();
    const seen: unknown[] = [];
    const stop = createSupabaseAuthClient(f.supabase).onChange(s => seen.push(s?.user.id ?? null));
    f.emit('SIGNED_IN', { access_token: 'jwt', user: { id: 'u1', email: 'a@b.c' } });
    f.emit('SIGNED_OUT', null);
    stop();
    expect(seen).toEqual(['u1', null]);
    expect(f.calls).toContainEqual(['unsubscribe']);
  });

  it('signs out', async () => {
    const f = fakeSupabase();
    await createSupabaseAuthClient(f.supabase).signOut();
    expect(f.calls).toEqual([['signout']]);
  });

  describe('what its errors mean', () => {
    const cases: [string, { status?: number; code?: string; message?: string }, 'send' | 'verify', string][] = [
      ['too many emails', { status: 429, code: 'over_email_send_rate_limit' }, 'send', 'too-many'],
      ['too many requests', { status: 429 }, 'verify', 'too-many'],
      ['a rate limit in words only', { message: 'Email rate limit exceeded' }, 'send', 'too-many'],
      ['a code that has run out', { status: 403, code: 'otp_expired' }, 'verify', 'wrong-code'],
      ['a wrong code', { status: 400, code: 'invalid_credentials' }, 'verify', 'wrong-code'],
      ['a code refused with 422', { status: 422 }, 'verify', 'wrong-code'],
      ['an address it will not send to', { status: 400, code: 'email_address_invalid', message: 'Email address is invalid' }, 'send', 'invalid-email'],
      ['a server error while sending', { status: 500 }, 'send', 'unavailable'],
      ['a server error while checking a code', { status: 500 }, 'verify', 'unavailable'],
      ['nothing it tells', {}, 'verify', 'unavailable'],
    ];
    it.each(cases)('%s', async (_label, error, step, expected) => {
      expect(authErrorOf(error, step).code).toBe(expected);
    });

    it('become AuthErrors from each step, with the cause kept', async () => {
      const f = fakeSupabase();
      const client = createSupabaseAuthClient(f.supabase);
      f.answers.send = { status: 429, code: 'over_email_send_rate_limit', message: 'x' };
      const caught = await client.sendCode('me@example.org').catch(e => e);
      expect(caught).toBeInstanceOf(AuthError);
      expect(caught.code).toBe('too-many');
      expect(caught.cause).toMatchObject({ status: 429 });
      f.answers.verify = { status: 403, code: 'otp_expired' };
      await expect(client.verifyCode('me@example.org', '123456')).rejects.toMatchObject({ code: 'wrong-code' });
      f.answers.out = { status: 500 };
      await expect(client.signOut()).rejects.toMatchObject({ code: 'unavailable' });
    });

    it('a request that cannot be made at all is the service being unavailable', async () => {
      const f = fakeSupabase();
      f.answers.throws = true;
      const client = createSupabaseAuthClient(f.supabase);
      await expect(client.sendCode('me@example.org')).rejects.toMatchObject({ code: 'unavailable' });
      await expect(client.verifyCode('me@example.org', '123456')).rejects.toMatchObject({ code: 'unavailable' });
      await expect(client.signOut()).rejects.toMatchObject({ code: 'unavailable' });
    });
  });
});

describe('choosing the sign-in service', () => {
  it('refuses the made-up sign-in in a production build, whatever else is set', async () => {
    await expect(createAuthClient({ NEXT_PUBLIC_TEST_AUTH: '1', NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' })).rejects.toThrow('must never be');
  });

  it('does not turn the made-up sign-in on for any value but 1', async () => {
    await expect(createAuthClient({ NEXT_PUBLIC_TEST_AUTH: 'true', NODE_ENV: 'production' })).rejects.toThrow('are not set');
  });

  it('wants both Supabase settings', async () => {
    await expect(createAuthClient({})).rejects.toThrow('are not set');
    await expect(createAuthClient({ NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co' })).rejects.toThrow('are not set');
    await expect(createAuthClient({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: '  ' })).rejects.toThrow('are not set');
  });

  it('offers Google sign-in only when a Google client id is set, and ignores a blank one', async () => {
    const base = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' };
    expect((await createAuthClient(base)).google).toBeUndefined();
    expect((await createAuthClient({ ...base, NEXT_PUBLIC_GOOGLE_CLIENT_ID: '   ' })).google).toBeUndefined();
    expect((await createAuthClient({ ...base, NEXT_PUBLIC_GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com' })).google).toBeDefined();
  });

  it('takes the publishable key under its new name, and under the old one', async () => {
    const url = 'https://abc.supabase.co';
    expect(typeof (await createAuthClient({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1' })).sendCode).toBe('function');
    expect(typeof (await createAuthClient({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-1' })).sendCode).toBe('function');
    await expect(createAuthClient({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '  ' })).rejects.toThrow('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set');
  });

  it('makes a Supabase sign-in from the two settings', async () => {
    const client = await createAuthClient({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' });
    expect(typeof client.sendCode).toBe('function');
    expect(await client.getSession()).toBeNull();
  });
});

describe('the token the data layer asks for', () => {
  it('is nobody’s until a sign-in source is set, then follows whichever is set', async () => {
    expect(await session.getToken()).toBeNull();
    setSessionSource({ getToken: async () => 'first' });
    expect(await session.getToken()).toBe('first');
    setSessionSource({ getToken: async () => 'second' });
    expect(await session.getToken()).toBe('second');
    setSessionSource({ getToken: async () => null });
  });
});
