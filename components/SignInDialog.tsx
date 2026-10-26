'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AuthManager } from '@/lib/auth/AuthManager';
import { demoSignInHint, emailSignInEnabled } from '@/lib/auth/runtime';
import { AuthError, type GoogleSignIn } from '@/lib/auth/types';
import { useDialog } from './useDialog';

interface SignInDialogProps {
  manager: AuthManager;
  /** Why the writer is being asked, if it is not obvious ("Sign in to save your poem."). */
  reason?: string;
  onClose: () => void;
  /** Called once, after the code was accepted and the writer is signed in. */
  onSignedIn?: () => void;
  /** Whether to offer the email form; false leaves Google alone. Defaults to the site's setting. */
  emailSignIn?: boolean;
}

const FIELD =
  'w-full px-3 py-2 bg-[#F3EBDD] border border-[#DDD5C5] rounded text-sm text-[#24231F] focus:outline-none focus:ring-1 focus:ring-[#24231F]';
const PRIMARY =
  'px-4 py-2 bg-[#24231F] hover:bg-[#3D3A33] text-[#F3EBDD] rounded text-xs font-medium transition-colors shadow-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';
const SECONDARY =
  'px-3 py-2 border border-[#E0D4BE] hover:bg-[#E4D8C2]/40 rounded text-xs font-medium text-[#57544E] transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

const messageOf = (error: unknown) => (error instanceof AuthError ? error.message : 'Sign-in is not available right now. Please try again.');

/**
 * Signing in with a one-time code: the writer gives an email address, is sent a code, and types it here.
 * Nothing leaves the page, so what is on it (a poem in the Studio) stays. The same dialog is the way in
 * for a new account: the first sign-in makes it.
 */
export function SignInDialog({ manager, reason, onClose, onSignedIn, emailSignIn = emailSignInEnabled() }: SignInDialogProps) {
  const headingId = useId();
  const emailId = useId();
  const codeId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);

  // Google's failure message suggests the email form, which is not there when email sign-in is off.
  const shown = (message: string) => (emailSignIn ? message : message.replace(', or use your email', ''));

  // Signing in with Google, if it is set up: Google draws its own button in the box below.
  const [google, setGoogle] = useState<GoogleSignIn | null>(null);
  const [googleChecked, setGoogleChecked] = useState(false);
  const googleBox = useRef<HTMLDivElement>(null);
  const finished = useRef({ onSignedIn, onClose });
  useEffect(() => {
    finished.current = { onSignedIn, onClose };
  });

  useEffect(() => {
    let cancelled = false;
    void manager.googleSignIn().then(found => {
      if (cancelled) return;
      setGoogle(found);
      setGoogleChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [manager]);

  useEffect(() => {
    const box = googleBox.current;
    if (!google || !box || step !== 'email') return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    google
      .renderButton(box, {
        onSignedIn: () => {
          finished.current.onSignedIn?.();
          finished.current.onClose();
        },
        onError: err => setError(shown(err.message)),
      })
      .then(dispose => {
        if (cancelled) dispose();
        else remove = dispose;
      })
      .catch(err => {
        if (!cancelled) setError(shown(messageOf(err)));
      });
    return () => {
      cancelled = true;
      remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shown` only depends on the setting, which does not change
  }, [google, step]);

  // Moving between the two steps replaces the form, and whatever had focus goes with it: put focus on the new step's field.
  useEffect(() => {
    (step === 'email' ? emailField : codeField).current?.focus();
  }, [step]);

  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    setSentNotice(null);
    try {
      await manager.sendCode(email);
      setStep('code');
      setCode('');
      setSentNotice(`We sent a code to ${email.trim()}. It can take a minute to arrive.`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await manager.verifyCode(email, code);
      onSignedIn?.();
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-6 text-[#24231F] shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between border-b border-[#E0D4BE] pb-3">
          <h2 id={headingId} className="font-serif text-lg font-bold">
            Sign in
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-lg font-bold text-[#605C53] hover:text-[#24231F]">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {reason && <p className="mb-3 text-sm text-[#57544E]">{reason}</p>}
        {demoSignInHint() && (
          <p className="mb-3 rounded border border-[#E0D4BE] bg-[#E4D8C2]/40 px-3 py-2 text-xs text-[#57544E]">{demoSignInHint()}</p>
        )}

        {step === 'email' && google && (
          <div className={emailSignIn ? 'mb-4' : ''}>
            <div ref={googleBox} className="flex min-h-[44px] items-center justify-center" />
            {emailSignIn && (
              <div className="mt-4 flex items-center gap-3 text-xs text-[#605C53]" aria-hidden="true">
                <span className="h-px flex-1 bg-[#E0D4BE]" />
                or
                <span className="h-px flex-1 bg-[#E0D4BE]" />
              </div>
            )}
          </div>
        )}

        {!emailSignIn ? (
          <div className="space-y-4">
            {googleChecked && !google && (
              <p role="alert" className="text-sm text-[#6C3438]">
                Sign-in is not available right now.
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-[#6C3438]">
                {error}
              </p>
            )}
            <div className="flex justify-end border-t border-[#E0D4BE] pt-3">
              <button type="button" onClick={onClose} className={SECONDARY} data-autofocus>
                Cancel
              </button>
            </div>
          </div>
        ) : step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-4" noValidate>
            <div>
              <label htmlFor={emailId} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#57544E]">
                Email address
              </label>
              <input
                id={emailId}
                ref={emailField}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-describedby={error ? `${emailId}-error` : undefined}
                aria-invalid={error ? true : undefined}
                className={FIELD}
                data-autofocus
              />
              <p className="mt-1.5 text-xs text-[#605C53]">We will email you a code. There is no password, and a new address makes a new account.</p>
            </div>
            {error && (
              <p role="alert" id={`${emailId}-error`} className="text-xs text-[#6C3438]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-[#E0D4BE] pt-3">
              <button type="button" onClick={onClose} className={SECONDARY}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={signIn} className="space-y-4" noValidate>
            <p role="status" className="text-sm text-[#57544E]">
              {sentNotice}
            </p>
            <div>
              <label htmlFor={codeId} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#57544E]">
                Code from the email
              </label>
              <input
                id={codeId}
                ref={codeField}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value)}
                aria-describedby={error ? `${codeId}-error` : undefined}
                aria-invalid={error ? true : undefined}
                className={`${FIELD} tracking-widest`}
                data-autofocus
              />
            </div>
            {error && (
              <p role="alert" id={`${codeId}-error`} className="text-xs text-[#6C3438]">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E0D4BE] pt-3">
              <div className="flex gap-2">
                <button type="button" onClick={() => sendCode()} disabled={busy} className={SECONDARY}>
                  Send a new code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setError(null);
                  }}
                  disabled={busy}
                  className={SECONDARY}
                >
                  Use another address
                </button>
              </div>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
