'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Passage, Poem } from '@/lib/models';
import { poemPreview } from '@/lib/poems/preview';
import { poemService } from '@/lib/services';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { useDialog } from './useDialog';

interface DraftsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPoem: (poem: Poem) => void;
  /** The library's passages, so each poem can show its book and its first lines. */
  passages: Passage[];
}

export function DraftsDrawer({ isOpen, ...panelProps }: DraftsDrawerProps) {
  // The panel mounts fresh on every open, so it always starts in the loading state.
  return isOpen ? <DraftsPanel {...panelProps} /> : null;
}

function DraftsPanel({ onClose, onLoadPoem, passages }: Omit<DraftsDrawerProps, 'isOpen'>) {
  // null while the first fetch is in flight
  const [drafts, setDrafts] = useState<Poem[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Poem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The Delete button that asked the question, to give focus back to if the reader cancels. Not left
  // to the dialog: Safari does not focus a button when it is clicked.
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const passageById = useMemo(() => new Map(passages.map(p => [p.id, p])), [passages]);

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

  // Focus is set once the dialog has gone, after React has finished with it.
  const focusLater = (target: () => HTMLElement | null | undefined) => setTimeout(() => target()?.focus(), 0);

  const askToDelete = (poem: Poem, trigger: HTMLElement) => {
    deleteTrigger.current = trigger;
    setDeleteError(null);
    setPendingDelete(poem);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
    focusLater(() => deleteTrigger.current);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await poemService.deletePoem(pendingDelete.id);
      setDrafts(await poemService.listPoems());
      setPendingDelete(null);
      // The Delete button that opened the question is gone with its poem, so keep the reader's
      // place in the collection instead of dropping focus onto the page.
      focusLater(() => dialogRef.current);
    } catch {
      setDeleteError('This poem could not be deleted. Please try again.');
    } finally {
      setDeleting(false);
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
                const passage = passageById.get(poem.passageId);
                const preview = poemPreview(poem, passage);

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
                      <span className="block text-[11px] text-[#57544E] mb-2">
                        {passage ? (
                          <>
                            From <span className="font-medium text-[#24231F]">{passage.attribution.title}</span>
                          </>
                        ) : (
                          'Its book is no longer in the library'
                        )}
                      </span>
                      <span className="mb-3 block font-literary text-[13px] leading-snug text-[#24231F]">
                        {preview === null ? (
                          <span className="italic text-[#57544E]">This poem can no longer be shown.</span>
                        ) : preview.lines.length === 0 ? (
                          <span className="italic text-[#57544E]">No words kept.</span>
                        ) : (
                          <>
                            {preview.lines.map((line, i) => (
                              <span key={i} className="block">
                                {line}{' '}
                              </span>
                            ))}
                            {preview.more && <span className="block text-[#57544E]">…</span>}
                          </>
                        )}
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
                      onClick={event => askToDelete(poem, event.currentTarget)}
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

      {pendingDelete && (
        <ConfirmDeleteDialog
          name={pendingDelete.title || 'Untitled Poem'}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          error={deleteError}
          busy={deleting}
        />
      )}
    </div>
  );
}
