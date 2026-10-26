'use client';

import { useId, useState } from 'react';
import { describeError } from '@/lib/errors/describe';
import { bringAcross, localPoems, rememberBringAcross } from '@/lib/account/bringAcross';
import { poemService } from '@/lib/services';
import { useDialog } from './useDialog';

interface BringAcrossDialogProps {
  userId: string;
  /** How many poems this browser holds. */
  count: number;
  onClose: () => void;
}

const PRIMARY =
  'px-4 py-2 bg-[#24231F] hover:bg-[#3D3A33] text-[#F3EBDD] rounded text-xs font-medium transition-colors shadow-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';
const SECONDARY =
  'px-4 py-2 border border-[#E0D4BE] hover:bg-[#E4D8C2]/40 rounded text-xs font-medium text-[#57544E] transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

const poems = (n: number) => `${n} ${n === 1 ? 'poem' : 'poems'}`;

/**
 * The offer to add the poems kept in this browser to the account the writer has just signed in to. It
 * only ever adds: a poem the account already has is left as it is, so asking twice adds nothing twice,
 * and nothing in this browser is touched. Closing the dialog is an answer too ("not now"), so it is not
 * asked again unprompted; the account dialog keeps the offer.
 */
export function BringAcrossDialog({ userId, count, onClose }: BringAcrossDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const close = () => {
    if (result === null) rememberBringAcross(userId, 'declined');
    onClose();
  };
  const dialogRef = useDialog<HTMLDivElement>(close);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const plan = await bringAcross(await localPoems(), poemService);
      rememberBringAcross(userId, 'done');
      const parts = [`Added ${poems(plan.toAdd.length)} to your account.`];
      if (plan.alreadyHere > 0) parts.push(`${poems(plan.alreadyHere)} ${plan.alreadyHere === 1 ? 'was' : 'were'} already there.`);
      if (plan.differentKept > 0) parts.push(`${poems(plan.differentKept)} in your account differed from the copies here, and were left as they are.`);
      parts.push('The poems in this browser have not been changed.');
      setResult(parts.join(' '));
    } catch (err) {
      setError(describeError(err, 'bring'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-6 text-[#24231F] shadow-2xl"
      >
        <h2 id={headingId} className="font-serif text-lg font-bold">
          Add your poems to your account?
        </h2>
        {result === null ? (
          <>
            <p id={descriptionId} className="mt-2 text-sm text-[#57544E]">
              {count === 1 ? 'There is 1 poem' : `There are ${count} poems`} saved in this browser. Adding {count === 1 ? 'it' : 'them'} to your account keeps {count === 1 ? 'it' : 'them'} with you on any device.
              Nothing here is deleted or changed.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-[#6C3438]">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} disabled={busy} className={SECONDARY} data-autofocus>
                Not now
              </button>
              <button type="button" onClick={add} disabled={busy} className={PRIMARY}>
                {busy ? 'Adding…' : `Add ${poems(count)}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p id={descriptionId} role="status" className="mt-2 text-sm text-[#57544E]">
              {result}
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={close} className={PRIMARY} data-autofocus>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
