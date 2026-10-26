'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { bringAcrossAnswered, localPoemCount } from '@/lib/account/bringAcross';
import { describeError } from '@/lib/errors/describe';
import { accountApi } from '@/lib/services';
import type { AuthManager } from '@/lib/auth/AuthManager';
import { AuthError, type AuthUser } from '@/lib/auth/types';
import { BringAcrossDialog } from './BringAcrossDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { SignInDialog } from './SignInDialog';
import { useAuth } from './useAuth';
import { useDialog } from './useDialog';

const BUTTON =
  'px-3.5 py-1.5 bg-[#FAF6EE] hover:bg-[#E4D8C2] border border-[#E0D4BE] rounded text-xs font-medium text-[#24231F] transition-colors shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';
const ROW =
  'w-full rounded border border-[#E0D4BE] px-3 py-2 text-left text-xs font-medium text-[#24231F] hover:bg-[#E4D8C2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

/**
 * Who is signed in, and the way to change that: "Sign in" for a visitor, "Account" for someone signed
 * in. It is not shown at all when the poems are kept in the browser (there is no account to have). When
 * someone signs in on a browser that holds poems, it offers to add them to the account.
 */
export function AccountControl() {
  const { enabled, state, manager } = useAuth();
  const [dialog, setDialog] = useState<'sign-in' | 'account' | null>(null);
  // Who the account dialog is about, kept while it is open: it outlives the sign-in when the account is deleted, to say so.
  const [accountUser, setAccountUser] = useState<AuthUser | null>(null);
  const [offer, setOffer] = useState<{ userId: string; count: number } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const userId = state.status === 'signed-in' ? state.user.id : null;
  // Someone is signed in and has not yet been asked about the poems in this browser: ask once.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      if (bringAcrossAnswered(userId)) return;
      const count = await localPoemCount();
      if (!cancelled && count > 0) setOffer({ userId, count });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!enabled) return null;
  // On the server, and until the sign-in service has answered, only the space where the button will be.
  if (!manager || state.status === 'loading') return <span aria-hidden="true" className="inline-block h-[30px] w-[72px]" />;

  const closeDialog = () => {
    setDialog(null);
    setTimeout(() => opener.current?.focus(), 0);
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => {
          if (state.status === 'signed-in') setAccountUser(state.user);
          setDialog(state.status === 'signed-in' ? 'account' : 'sign-in');
        }}
        aria-haspopup="dialog"
        className={BUTTON}
      >
        {state.status === 'signed-in' ? 'Account' : 'Sign in'}
      </button>
      {dialog === 'sign-in' && <SignInDialog manager={manager} onClose={closeDialog} />}
      {dialog === 'account' && accountUser && <AccountDialog manager={manager} user={accountUser} onClose={closeDialog} />}
      {offer && <BringAcrossDialog userId={offer.userId} count={offer.count} onClose={() => setOffer(null)} />}
    </>
  );
}

function AccountDialog({ manager, user, onClose }: { manager: AuthManager; user: AuthUser; onClose: () => void }) {
  const headingId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [localCount, setLocalCount] = useState(0);
  const [bringing, setBringing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    localPoemCount().then(setLocalCount, () => setLocalCount(0));
  }, []);

  const signOut = async () => {
    setSignOutError(null);
    try {
      await manager.signOut();
      onClose();
    } catch (err) {
      setSignOutError(err instanceof AuthError ? err.message : 'Could not sign you out. Please try again.');
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await accountApi.deleteAccount();
      // The account is gone; end this browser's sign-in too (it may complain that there is nobody to sign out).
      await manager.signOut().catch(() => {});
      setConfirmDelete(false);
      setDeleted(true);
    } catch (err) {
      setDeleteError(describeError(err, 'account'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
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
              Your account
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-lg font-bold text-[#605C53] hover:text-[#24231F]">
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          {deleted ? (
            <>
              <p role="status" className="text-sm text-[#57544E]">
                Your account and every poem saved in it have been deleted. You are signed out.
              </p>
              <button type="button" onClick={onClose} className={`${ROW} mt-4 text-center`} data-autofocus>
                Close
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[#57544E]">
                Signed in as <span className="font-medium text-[#24231F]">{user.email}</span>
              </p>
              <div className="mt-4 space-y-2">
                {localCount > 0 && (
                  <button type="button" onClick={() => setBringing(true)} className={ROW}>
                    Add the {localCount === 1 ? 'poem' : `${localCount} poems`} saved in this browser…
                  </button>
                )}
                <button type="button" onClick={signOut} className={ROW} data-autofocus>
                  Sign out
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className={`${ROW} text-[#6C3438]`}>
                  Delete my account…
                </button>
              </div>
              {signOutError && (
                <p role="alert" className="mt-3 text-xs text-[#6C3438]">
                  {signOutError}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {bringing && <BringAcrossDialog userId={user.id} count={localCount} onClose={() => setBringing(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete your account?"
          description="This permanently deletes your account and every poem saved in it. It cannot be undone. Poems saved in this browser's own storage are not touched."
          confirmLabel="Delete account"
          busyLabel="Deleting…"
          onConfirm={deleteAccount}
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
          error={deleteError}
          busy={deleting}
        />
      )}
    </>
  );
}
