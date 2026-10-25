'use client';

import { useId } from 'react';
import { useDialog } from './useDialog';

interface ConfirmDialogProps {
  title: string;
  description: string;
  /** The button that does the thing, named for what it does ("Delete poem", "Discard changes"). */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Set when the action was tried and failed; the dialog stays open so it can be tried again. */
  error?: string | null;
  busy?: boolean;
  busyLabel?: string;
}

/**
 * A question that must be answered before something is lost. Focus starts on the safe choice
 * (cancel), so pressing Enter or Space by reflex changes nothing; Escape cancels; focus goes back to
 * what opened it.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  error = null,
  busy = false,
  busyLabel = 'Working…',
}: ConfirmDialogProps) {
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
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-[#57544E]">
          {description}
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
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded bg-[#6C3438] px-4 py-2 text-xs font-medium text-[#F3EBDD] hover:bg-[#57292D] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24231F]"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
