'use client';

import React, { useState } from 'react';

interface SaveDraftModalProps {
  isOpen: boolean;
  initialTitle: string;
  passageTitle: string;
  retainedCount: number;
  onSave: (title: string) => Promise<void>;
  onClose: () => void;
}

export function SaveDraftModal({
  isOpen,
  initialTitle,
  passageTitle,
  retainedCount,
  onSave,
  onClose,
}: SaveDraftModalProps) {
  const [title, setTitle] = useState(initialTitle || 'Untitled Poem');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave(title);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
      <div className="bg-[#FAF6EE] border border-[#E0D4BE] rounded-lg shadow-xl max-w-md w-full p-6 text-[#24231F] animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#E0D4BE] pb-3 mb-4">
          <h3 className="font-serif font-bold text-lg text-[#24231F]">
            Save Poem Draft
          </h3>
          <button
            onClick={onClose}
            className="text-[#8B867C] hover:text-[#24231F] text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#57544E] mb-1.5">
              Poem Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Winter Twilight"
              required
              className="w-full px-3 py-2 bg-[#F3EBDD] border border-[#DDD5C5] rounded text-sm text-[#24231F] focus:outline-none focus:ring-1 focus:ring-[#24231F]"
              autoFocus
            />
          </div>

          <div className="bg-[#E4D8C2]/30 rounded p-3 text-xs text-[#57544E] space-y-1">
            <div>
              <span className="font-semibold text-[#24231F]">Source:</span> {passageTitle}
            </div>
            <div>
              <span className="font-semibold text-[#24231F]">Words Retained:</span> {retainedCount}
            </div>
            <div className="text-[11px] text-[#8B867C] pt-1">
              Drafts are stored locally in your browser storage.
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
    </div>
  );
}
