'use client';

import { useId } from 'react';
import { useDialog } from './useDialog';

interface NoticeDialogProps {
  title: string;
  body: string;
  /** The one button, named for what it does. */
  buttonLabel?: string;
  onClose: () => void;
}

/**
 * Something the writer has to be told and cannot miss: a pop-up with a heading, a few plain sentences and
 * one button. It takes focus, keeps it until it is closed (Enter, Escape or the button), and gives it back
 * to what was being done. For news that is bigger than a line of small text under a form.
 */
export function NoticeDialog({ title, body, buttonLabel = 'OK', onClose }: NoticeDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-6 text-[#24231F] shadow-2xl"
      >
        <h2 id={titleId} className="font-serif text-lg font-bold">
          {title}
        </h2>
        <p id={bodyId} className="mt-2 text-sm leading-relaxed text-[#57544E]">
          {body}
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            className="rounded bg-[#24231F] px-4 py-2 text-xs font-medium text-[#F3EBDD] shadow-sm transition-colors hover:bg-[#3D3A33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
