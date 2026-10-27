'use client';

import { useEffect, useId, useState } from 'react';
import type { Book, Passage } from '@/lib/models';
import { bookService } from '@/lib/services';
import { BookBrowser, excerptLabel } from './BookBrowser';
import { useDialog } from './useDialog';

const BUTTON =
  'rounded border border-[#E0D4BE] bg-[#FAF6EE] px-3 py-1.5 text-xs font-medium text-[#24231F] transition-colors hover:bg-[#E4D8C2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438] disabled:cursor-not-allowed disabled:opacity-50';

const PRIMARY =
  'rounded border border-[#24231F] bg-[#24231F] px-3 py-1.5 text-xs font-medium text-[#F3EBDD] transition-colors hover:bg-[#3D3A33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

interface PassageSwitcherProps {
  /** The excerpt on screen. */
  passage: Passage;
  /** Called with the id of the excerpt to go to (the page loads it, and may ask first). */
  onChoose: (id: string) => void;
}

/**
 * What stands in a page's header where the row of passage buttons was, when there is a library of books: the
 * book and excerpt on screen, buttons to step to the one before or after, and one that opens the window for
 * choosing a book and an excerpt.
 */
export function PassageSwitcher({ passage, onChoose }: PassageSwitcherProps) {
  const [choosing, setChoosing] = useState(false);
  const position = passage.position;
  return (
    <div role="group" aria-label="Passage" className="card-gilt flex flex-wrap items-center gap-2 rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] px-3 py-2.5">
      <div className="mr-auto min-w-0 max-w-full">
        <p className="text-xs text-[#57544E]">
          {passage.attribution.title}, {passage.attribution.author}
        </p>
        <p className="text-sm font-medium text-[#24231F]">
          {excerptLabel(passage)}
          {position && <span className="ml-1.5 text-xs font-normal text-[#57544E]">· excerpt {position.ordinal} of {position.count}</span>}
        </p>
      </div>
      <button type="button" disabled={!position?.previousId} onClick={() => position?.previousId && onChoose(position.previousId)} className={BUTTON}>
        <span aria-hidden="true">← </span>Previous excerpt
      </button>
      <button type="button" disabled={!position?.nextId} onClick={() => position?.nextId && onChoose(position.nextId)} className={BUTTON}>
        Next excerpt<span aria-hidden="true"> →</span>
      </button>
      <button type="button" onClick={() => setChoosing(true)} className={PRIMARY}>
        Change book or excerpt
      </button>
      {choosing && (
        <PassagePickerDialog
          bookId={passage.bookId}
          onChoose={id => {
            setChoosing(false);
            onChoose(id);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
    </div>
  );
}

/** The window for choosing a book and an excerpt. It opens at the excerpts of `bookId`, the book being read, if it is given. */
export function PassagePickerDialog({ bookId, onChoose, onClose }: { bookId?: string; onChoose: (id: string) => void; onClose: () => void }) {
  const headingId = useId();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [book, setBook] = useState<Book | null | 'loading'>(bookId ? 'loading' : null);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    bookService.getRemoteBook(bookId).then(
      found => {
        if (!cancelled) setBook(found);
      },
      () => {
        if (!cancelled) setBook(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-[#E0D4BE] bg-[#F3EBDD] p-5 text-[#24231F] shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between border-b border-[#E0D4BE] pb-3">
          <h2 id={headingId} className="font-serif text-lg font-bold">
            Choose a book and an excerpt
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-lg font-bold text-[#605C53] hover:text-[#24231F]">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {book === 'loading' ? (
            <p role="status" className="text-sm text-[#57544E]">
              Opening the book…
            </p>
          ) : (
            // Mounted once the book is known, so that it opens at that book's excerpts.
            <BookBrowser initialBook={book} autoFocus onChoose={passage => onChoose(passage.id)} />
          )}
        </div>
      </div>
    </div>
  );
}
