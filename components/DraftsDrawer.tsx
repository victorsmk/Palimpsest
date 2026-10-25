'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Passage, Poem } from '@/lib/models';
import { MAX_BACKUP_BYTES, describeRestore, readBackup, type RestorePlan } from '@/lib/backup';
import { downloadTextFile } from '@/lib/export/text';
import { poemPreview } from '@/lib/poems/preview';
import { poemService } from '@/lib/services';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { RenamePoemForm } from './RenamePoemForm';
import { useDialog } from './useDialog';

interface DraftsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPoem: (poem: Poem) => void;
  /** The library's passages, so each poem can show its book and its first lines. */
  passages: Passage[];
  /** Called after a poem is renamed here, so the Studio can follow if that poem is the one open. */
  onRenamed?: (poem: Poem) => void;
}

/** A small text button on a poem's card. Tall enough to touch (at least 24 px). */
const ACTION =
  'rounded px-2.5 py-1 text-xs text-[#57544E] hover:bg-[#E4D8C2]/60 hover:text-[#24231F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

/** The smaller buttons above "Close Collection": back up, restore. */
const FOOTER_ACTION =
  'rounded border border-[#E0D4BE] px-3 py-1.5 text-xs font-medium text-[#24231F] hover:bg-[#E4D8C2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

export function DraftsDrawer({ isOpen, ...panelProps }: DraftsDrawerProps) {
  // The panel mounts fresh on every open, so it always starts in the loading state.
  return isOpen ? <DraftsPanel {...panelProps} /> : null;
}

function DraftsPanel({ onClose, onLoadPoem, passages, onRenamed }: Omit<DraftsDrawerProps, 'isOpen'>) {
  // null while the first fetch is in flight
  const [drafts, setDrafts] = useState<Poem[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Poem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  // What the last rename or copy did, said on screen and aloud; or why it failed.
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // A backup the reader has chosen, read and checked, waiting to be told to go ahead.
  const [pendingRestore, setPendingRestore] = useState<{
    poems: Poem[];
    plan: RestorePlan;
    entries: number;
    unreadable: number;
    repeated: number;
  } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
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

  // A card's action buttons are found by poem, since the list is reordered by every rename and copy.
  const actionButton = (action: 'rename' | 'duplicate', id: string) =>
    [...(dialogRef.current?.querySelectorAll<HTMLElement>(`[data-${action}-for]`) ?? [])].find(
      el => el.dataset[`${action}For`] === id
    );

  const startRename = (poem: Poem) => {
    setRenameError(null);
    setNotice(null);
    setRenamingId(poem.id);
  };

  const stopRename = (poem: Poem) => {
    setRenamingId(null);
    focusLater(() => actionButton('rename', poem.id));
  };

  const saveRename = async (poem: Poem, title: string) => {
    setRenameBusy(true);
    try {
      const renamed = await poemService.renamePoem(poem.id, title);
      setDrafts(await poemService.listPoems());
      setRenamingId(null);
      setNotice({ text: `Renamed to “${renamed.title}”.`, tone: 'ok' });
      onRenamed?.(renamed);
      focusLater(() => actionButton('rename', poem.id));
    } catch {
      setRenameError('Could not rename this poem. Please try again.');
    } finally {
      setRenameBusy(false);
    }
  };

  const duplicate = async (poem: Poem) => {
    if (duplicatingId) return;
    setDuplicatingId(poem.id);
    setNotice(null);
    try {
      const copy = await poemService.duplicatePoem(poem.id);
      setDrafts(await poemService.listPoems());
      setNotice({ text: `Duplicated as “${copy.title}”.`, tone: 'ok' });
      // The copy is the newest poem, so it is first in the list: bring it into view.
      setTimeout(() => {
        if (listRef.current) listRef.current.scrollTop = 0;
      }, 0);
    } catch {
      setNotice({ text: 'Could not duplicate this poem. Please try again.', tone: 'error' });
    } finally {
      // Not released at once: the new copy takes the top of the list and moves every card down, so a
      // second click of a double click would land on a different poem's Duplicate button.
      setTimeout(() => setDuplicatingId(null), 700);
    }
  };

  const backUp = async () => {
    setNotice(null);
    try {
      const backup = await poemService.exportBackup();
      if (backup.count === 0) {
        setNotice({ text: 'You have no poems to back up yet.', tone: 'ok' });
        return;
      }
      downloadTextFile(backup.filename, backup.text, 'application/json');
      setNotice({ text: `Backed up ${backup.count} ${backup.count === 1 ? 'poem' : 'poems'} to ${backup.filename}.`, tone: 'ok' });
    } catch {
      setNotice({ text: 'Could not create the backup. Please try again.', tone: 'error' });
    }
  };

  const readFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  // The reader has picked a file. Check it, then say what restoring it would do before doing anything.
  const chooseBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // so that choosing the same file again still counts
    if (!file) return;
    setNotice(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setNotice({ text: 'That file is too large to be a Palimpsest backup.', tone: 'error' });
      return;
    }
    try {
      const read = readBackup(await readFile(file));
      if (!read.ok) {
        setNotice({ text: read.message, tone: 'error' });
        return;
      }
      const plan = await poemService.planRestore(read.poems);
      const entries = read.poems.length + read.unreadable + read.repeated;
      if (plan.toAdd.length === 0) {
        const { headline, details } = describeRestore(entries, plan, read.unreadable, read.repeated);
        setNotice({ text: ['Nothing to add.', headline, ...details].join(' '), tone: 'ok' });
        return;
      }
      setRestoreError(null);
      setPendingRestore({ poems: read.poems, plan, entries, unreadable: read.unreadable, repeated: read.repeated });
    } catch {
      setNotice({ text: 'That file could not be read. Please try another.', tone: 'error' });
    }
  };

  const cancelRestore = () => {
    setPendingRestore(null);
    focusLater(() => restoreButton.current);
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      const done = await poemService.restoreBackup(pendingRestore.poems);
      setDrafts(await poemService.listPoems());
      setPendingRestore(null);
      const added = done.toAdd.length;
      setNotice({ text: `Added ${added} ${added === 1 ? 'poem' : 'poems'} from the backup.`, tone: 'ok' });
      focusLater(() => restoreButton.current);
    } catch {
      setRestoreError('The poems could not be added, and your collection has not been changed. Please try again.');
    } finally {
      setRestoring(false);
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

          <p className="text-xs text-[#57544E] mb-2">
            Select a draft to resume editing on the book page:
          </p>
          <p role="status" className="mb-2 min-h-4 text-xs text-[#5B5D45]">
            {notice?.tone === 'ok' ? notice.text : ''}
          </p>
          {notice?.tone === 'error' && (
            <p role="alert" className="mb-2 text-xs text-[#6C3438]">
              {notice.text}
            </p>
          )}
        </div>

        {/* Drafts List */}
        <div ref={listRef} className="flex-1 overflow-y-auto pr-1 py-1">
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
                    {renamingId === poem.id ? (
                      <RenamePoemForm
                        name={name}
                        onSave={title => saveRename(poem, title)}
                        onCancel={() => stopRename(poem)}
                        busy={renameBusy}
                        error={renameError}
                      />
                    ) : (
                      <>
                        {/* Opening the draft and the actions on it are separate buttons: a button cannot nest another. */}
                        <button
                          type="button"
                          onClick={() => handleSelect(poem)}
                          className="block w-full text-left p-4 pb-2 rounded-t-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
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
                        <div className="flex justify-end gap-1 px-3 pb-3">
                          <button
                            type="button"
                            data-rename-for={poem.id}
                            onClick={() => startRename(poem)}
                            aria-label={`Rename draft ${name}`}
                            className={ACTION}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            data-duplicate-for={poem.id}
                            onClick={() => duplicate(poem)}
                            aria-label={`Duplicate draft ${name}`}
                            className={ACTION}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={event => askToDelete(poem, event.currentTarget)}
                            aria-label={`Delete draft ${name}`}
                            className={`${ACTION} hover:!text-red-700`}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#E0D4BE] text-center">
          <div className="mb-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={backUp} className={FOOTER_ACTION}>
              Back up all poems
            </button>
            <button
              type="button"
              ref={restoreButton}
              onClick={() => fileInput.current?.click()}
              className={FOOTER_ACTION}
            >
              Restore from a backup…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={chooseBackup}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-[#E4D8C2] hover:bg-[#D8CBB2] text-[#24231F] rounded text-xs font-medium transition-colors"
          >
            Close Collection
          </button>
        </div>
      </div>

      {pendingRestore && (
        <ConfirmDialog
          title="Restore from this backup?"
          description={(() => {
            const { headline, details } = describeRestore(
              pendingRestore.entries,
              pendingRestore.plan,
              pendingRestore.unreadable,
              pendingRestore.repeated
            );
            return [headline, ...details, 'Nothing you already have will be changed.'].join(' ');
          })()}
          confirmLabel={`Add ${pendingRestore.plan.toAdd.length} ${pendingRestore.plan.toAdd.length === 1 ? 'poem' : 'poems'}`}
          busyLabel="Adding…"
          onConfirm={confirmRestore}
          onCancel={cancelRestore}
          error={restoreError}
          busy={restoring}
        />
      )}

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
