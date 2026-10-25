'use client';

import { useId } from 'react';
import { useDialog } from './useDialog';

interface ConfirmDeleteDialogProps {
  /** What is being deleted, as the reader knows it: the poem's title. */
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Set when the deletion was tried and failed; the dialog stays open so it can be tried again. */
  error?: string | null;
  busy?: boolean;
}

/**
 * Asks before a saved poem is deleted for good. Focus starts on Cancel, so pressing Enter or Space
 * by reflex does not delete anything; Escape cancels; focus goes back to what opened it.
 */
export function ConfirmDeleteDialog({ name, onConfirm, onCancel, error = null, busy = false }: ConfirmDeleteDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onCancel);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-6 text-[#24231F] shadow-2xl"
      >
        <h2 id={titleId} className="font-serif text-lg font-bold">
          Delete “{name}”?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-[#57544E]">
          This poem will be removed from your collection. This can&apos;t be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-[#6C3438]">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-autofocus
            onClick={onCancel}
            className="rounded border border-[#E0D4BE] px-4 py-2 text-xs font-medium text-[#24231F] hover:bg-[#E4D8C2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded bg-[#6C3438] px-4 py-2 text-xs font-medium text-[#F3EBDD] hover:bg-[#57292D] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24231F]"
          >
            {busy ? 'Deleting…' : 'Delete poem'}
          </button>
        </div>
      </div>
    </div>
  );
}
