'use client';

import { useEffect, useId, useState } from 'react';
import type { Poem } from '@/lib/models';
import { poemService } from '@/lib/services';
import { useDialog } from './useDialog';

interface DraftsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPoem: (poem: Poem) => void;
}

export function DraftsDrawer({ isOpen, ...panelProps }: DraftsDrawerProps) {
  // The panel mounts fresh on every open, so it always starts in the loading state.
  return isOpen ? <DraftsPanel {...panelProps} /> : null;
}

function DraftsPanel({ onClose, onLoadPoem }: Omit<DraftsDrawerProps, 'isOpen'>) {
  // null while the first fetch is in flight
  const [drafts, setDrafts] = useState<Poem[] | null>(null);
  const titleId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    poemService
      .listPoems()
      .catch(() => [] as Poem[])
      .then(list => {
        if (!cancelled) setDrafts(list);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this saved draft?')) {
      await poemService.deletePoem(id);
      setDrafts(await poemService.listPoems());
    }
  };

  const handleSelect = (poem: Poem) => {
    onLoadPoem(poem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-150">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-[#FAF6EE] border-l border-[#E0D4BE] w-full max-w-md h-full shadow-2xl p-6 flex flex-col justify-between text-[#24231F] animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between border-b border-[#E0D4BE] pb-4 mb-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#6C3438] font-bold">
                My Collection
              </span>
              <h2 id={titleId} className="text-xl font-serif font-bold text-[#24231F] mt-0.5">
                Saved Poems & Drafts
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close collection"
              className="text-[#605C53] hover:text-[#24231F] text-xl font-bold p-1"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <p className="text-xs text-[#57544E] mb-4">
            Select a draft to resume editing on the book page:
          </p>
        </div>

        {/* Drafts List */}
        <div className="flex-1 overflow-y-auto pr-1 py-1">
          {drafts === null ? (
            <div role="status" className="text-center py-12 text-xs text-[#605C53]">
              Loading your collection...
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-16 px-4 bg-[#F3EBDD]/60 rounded-lg border border-[#E0D4BE]/60 text-xs text-[#605C53]">
              <p className="font-serif text-base text-[#24231F] mb-1">No drafts yet</p>
              <p>Save your work from the Studio to build your personal erasure anthology.</p>
            </div>
          ) : (
            <ul className="space-y-3 list-none">
              {drafts.map(poem => {
                const formattedDate = new Date(poem.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const name = poem.title || 'Untitled Poem';

                return (
                  <li
                    key={poem.id}
                    className="relative bg-[#F3EBDD] hover:bg-[#E4D8C2]/80 border border-[#E0D4BE] rounded-lg transition-all shadow-sm hover:shadow group"
                  >
                    {/* Opening the draft and deleting it are separate buttons: a button cannot nest another. */}
                    <button
                      type="button"
                      onClick={() => handleSelect(poem)}
                      className="block w-full text-left p-4 pr-20 rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
                    >
                      <span className="block font-serif font-semibold text-sm text-[#24231F] group-hover:text-[#6C3438] transition-colors mb-1">
                        {name}
                      </span>
                      <span className="block text-[11px] text-[#57544E] mb-3">
                        Passage: <span className="font-medium text-[#24231F]">{poem.passageId}</span>
                      </span>
                      <span className="flex items-center justify-between text-[11px] pt-2 border-t border-[#E0D4BE]/60">
                        <span className="flex items-center gap-2">
                          <span className="bg-[#E4D8C2] px-2 py-0.5 rounded text-[#24231F] font-medium uppercase text-[9px] tracking-wider">
                            {poem.erasureStyle}
                          </span>
                          <span className="text-[#57544E]">{poem.retainedTokenIds.length} words</span>
                        </span>
                        <span className="text-[#605C53] text-[10px]">{formattedDate}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(poem.id)}
                      aria-label={`Delete draft ${name}`}
                      className="absolute top-3 right-3 text-xs text-[#605C53] hover:text-red-700 px-2 py-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#E0D4BE] text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-[#E4D8C2] hover:bg-[#D8CBB2] text-[#24231F] rounded text-xs font-medium transition-colors"
          >
            Close Collection
          </button>
        </div>
      </div>
    </div>
  );
}
