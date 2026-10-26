'use client';

import React, { useId, useState } from 'react';
import { LIMITS } from '@/lib/models';
import { describeError, noticeFor, type ProblemNotice } from '@/lib/errors/describe';
import { NoticeDialog } from './NoticeDialog';
import { backendKind } from '@/lib/services';
import { useDialog } from './useDialog';

interface SaveDraftModalProps {
  isOpen: boolean;
  initialTitle: string;
  initialNotes: string;
  passageTitle: string;
  retainedCount: number;
  onSave: (title: string, notes: string) => Promise<void>;
  onClose: () => void;
}

export function SaveDraftModal({ isOpen, ...formProps }: SaveDraftModalProps) {
  // The form mounts fresh on every open, so its fields start from the current poem.
  return isOpen ? <SaveDraftForm {...formProps} /> : null;
}

function SaveDraftForm({
  initialTitle,
  initialNotes,
  passageTitle,
  retainedCount,
  onSave,
  onClose,
}: Omit<SaveDraftModalProps, 'isOpen'>) {
  const [title, setTitle] = useState(initialTitle || 'Untitled Poem');
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A poem changed or deleted somewhere else is news big enough for a pop-up, not a line of small text.
  const [problem, setProblem] = useState<ProblemNotice | null>(null);
  const headingId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave(title, notes);
      onClose();
    } catch (err) {
      const notice = noticeFor(err, 'save');
      if (notice) setProblem(notice);
      else setError(describeError(err, 'save'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="bg-[#FAF6EE] border border-[#E0D4BE] rounded-lg shadow-xl max-w-md w-full p-6 text-[#24231F] animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#E0D4BE] pb-3 mb-4">
          <h3 id={headingId} className="font-serif font-bold text-lg text-[#24231F]">
            Save Poem Draft
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#605C53] hover:text-[#24231F] text-lg font-bold p-1"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="poem-title"
              className="block text-xs font-medium uppercase tracking-wider text-[#57544E] mb-1.5"
            >
              Poem Title
            </label>
            <input
              id="poem-title"
              type="text"
              value={title}
              maxLength={LIMITS.titleMax}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Winter Twilight"
              required
              className="w-full px-3 py-2 bg-[#F3EBDD] border border-[#DDD5C5] rounded text-sm text-[#24231F] focus:outline-none focus:ring-1 focus:ring-[#24231F]"
              data-autofocus
            />
          </div>

          <div>
            <label
              htmlFor="poem-notes"
              className="block text-xs font-medium uppercase tracking-wider text-[#57544E] mb-1.5"
            >
              Notes <span className="normal-case tracking-normal text-[#605C53]">(optional)</span>
            </label>
            <textarea
              id="poem-notes"
              value={notes}
              maxLength={LIMITS.notesMax}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything to remember about this poem"
              className="w-full px-3 py-2 bg-[#F3EBDD] border border-[#DDD5C5] rounded text-sm text-[#24231F] focus:outline-none focus:ring-1 focus:ring-[#24231F] resize-y"
            />
          </div>

          <div className="bg-[#E4D8C2]/30 rounded p-3 text-xs text-[#57544E] space-y-1">
            <div>
              <span className="font-semibold text-[#24231F]">Source:</span> {passageTitle}
            </div>
            <div>
              <span className="font-semibold text-[#24231F]">Words Retained:</span> {retainedCount}
            </div>
            <div className="text-[11px] text-[#605C53] pt-1">
              {backendKind === 'server' ? 'Drafts are saved to your account.' : 'Drafts are stored locally in your browser storage.'}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-[#6C3438]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E0D4BE]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-[#E0D4BE] hover:bg-[#E4D8C2]/40 rounded text-xs font-medium text-[#57544E] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-[#24231F] hover:bg-[#3D3A33] text-[#F3EBDD] rounded text-xs font-medium transition-colors shadow-sm"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
          </div>
        </form>
      </div>
      {problem && <NoticeDialog title={problem.title} body={problem.body} onClose={() => setProblem(null)} />}
    </div>
  );
}
