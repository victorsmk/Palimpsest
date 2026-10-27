'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { Book, PassageSummary } from '@/lib/models';
import { bookService } from '@/lib/services';
import { usePagedList } from './usePagedList';

const BOOKS_PER_PAGE = 20;
const EXCERPTS_PER_PAGE = 50;
/** How long to wait after the last key before searching. */
const SEARCH_DELAY_MS = 250;

const ROW =
  'lift w-full rounded border border-l-4 border-[#E0D4BE] border-l-[#C29A45] bg-[#FAF6EE] px-4 py-3 text-left hover:bg-[#F6EEDB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';
const SECONDARY =
  'rounded border border-[#E0D4BE] px-3 py-1.5 text-xs font-medium text-[#24231F] hover:bg-[#E4D8C2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438] disabled:opacity-60';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** An excerpt's own name: its title without the book's name in front ("Chapter III (2 of 4)"). */
export function excerptLabel(passage: Pick<PassageSummary, 'title' | 'attribution'>): string {
  const prefix = `${passage.attribution.title} — `;
  return passage.title.startsWith(prefix) ? passage.title.slice(prefix.length) : passage.title;
}

interface BookBrowserProps {
  /** Called with the excerpt the reader picks. */
  onChoose: (passage: PassageSummary) => void;
  /** Open at this book's excerpts, instead of at the list of books (changing the excerpt of the book being read). */
  initialBook?: Book | null;
  /** The element to give focus on first showing: the search box. */
  autoFocus?: boolean;
}

/**
 * Finding something to read: a search box over the library's books, by title or author, then the chosen
 * book's excerpts. It is a list to browse and not a menu: a screen reader hears how many books were found,
 * and everything is a button.
 */
export function BookBrowser({ onChoose, initialBook = null, autoFocus = false }: BookBrowserProps) {
  const [book, setBook] = useState<Book | null>(initialBook);
  const [search, setSearch] = useState('');
  // The books and the excerpts keep their own list while the other is shown, so Back returns to where the reader was.
  return book ? (
    <ExcerptList book={book} onChoose={onChoose} onBack={() => setBook(null)} />
  ) : (
    <BookList search={search} onSearch={setSearch} onPick={setBook} autoFocus={autoFocus} />
  );
}

function BookList({ search, onSearch, onPick, autoFocus }: { search: string; onSearch: (text: string) => void; onPick: (book: Book) => void; autoFocus: boolean }) {
  const searchId = useId();
  const field = useRef<HTMLInputElement>(null);
  // The search box is where a reader starts, on a page that asks for a book and on coming back from a book's excerpts.
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);
  const list = usePagedList<Book>(search.trim(), after => bookService.searchBooks({ search: search.trim(), after, limit: BOOKS_PER_PAGE }), SEARCH_DELAY_MS);
  // The reader's own texts are found by the same search, and listed first: there are few of them.
  const own = usePagedList<Book>(search.trim(), after => bookService.listOwnBooks({ search: search.trim(), after, limit: 30 }));
  const searching = search.trim() !== '';
  const hasLibrary = bookService.hasRemoteLibrary;
  const total = list.items.length + own.items.length;

  const status = list.failed
    ? ''
    : list.loading || own.loading
      ? 'Searching…'
      : total === 0
        ? searching
          ? `No book matches “${search.trim()}”.`
          : hasLibrary
            ? 'The library has no books yet.'
            : 'You have not added a text of your own yet.'
        : list.hasMore
          ? `Showing the first ${plural(total, 'book', 'books')}. There are more.`
          : plural(total, 'book', 'books');

  return (
    <div>
      <label htmlFor={searchId} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#57544E]">
        Search by title or author
      </label>
      <input
        id={searchId}
        ref={field}
        type="search"
        value={search}
        onChange={event => onSearch(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder="For example: Austen, or whale"
        className="font-literary w-full rounded border border-[#C9B98F] bg-[#FAF6EE] px-4 py-3 text-base text-[#24231F] shadow-inner placeholder:italic focus:border-[#C29A45] focus:outline-none focus:ring-2 focus:ring-[#C29A45]/60"
        {...(autoFocus ? { 'data-autofocus': true } : {})}
      />
      <p role="status" className="mt-2 min-h-[1.25rem] text-xs text-[#57544E]">
        {status}
      </p>

      {list.failed ? (
        <div role="alert" className="mt-2 rounded border border-[#E0D4BE] bg-[#FAF6EE] px-3 py-3 text-sm text-[#6C3438]">
          The books could not be loaded.{' '}
          <button type="button" onClick={list.retry} className="underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : (
        <>
          {own.items.length > 0 && (
            <section aria-label="Your own texts" className="mb-4">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7A5C1A]">Your own texts</p>
              <ul className="space-y-2">
                {own.items.map(item => (
                  <li key={item.id}>
                    <button type="button" onClick={() => onPick(item)} className={ROW}>
                      <span className="font-display block text-lg font-bold leading-snug text-[#24231F]">{item.title}</span>
                      <span className="block text-xs text-[#57544E]">
                        {item.author}
                        {item.form === 'verse' && <span> · poetry</span>}
                        <span> · your own</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        <ul aria-busy={list.loading} className="mt-1 space-y-2">
          {list.items.map(item => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)} className={ROW}>
                <span className="font-display block text-lg font-bold leading-snug text-[#24231F]">{item.title}</span>
                <span className="block text-xs text-[#57544E]">
                  {item.author}, {item.year}
                  {item.form === 'verse' && <span> · poetry</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        </>
      )}

      <p className="mt-4 text-xs text-[#57544E]">
        <Link href="/texts" className="underline underline-offset-2 hover:text-[#24231F]">
          Add or change your own texts
        </Link>
      </p>

      {list.hasMore && (
        <div className="py-4 text-center">
          <button type="button" onClick={list.loadMore} disabled={list.more === 'loading'} className={SECONDARY}>
            {list.more === 'loading' ? 'Loading…' : 'Show more books'}
          </button>
          {list.more === 'failed' && (
            <p role="alert" className="mt-2 text-xs text-[#6C3438]">
              More books could not be loaded. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ExcerptList({ book, onChoose, onBack }: { book: Book; onChoose: (passage: PassageSummary) => void; onBack: () => void }) {
  const list = usePagedList<PassageSummary>(book.id, after => bookService.listBookPassages(book.id, { after, limit: EXCERPTS_PER_PAGE }));
  return (
    <div>
      <button type="button" onClick={onBack} className={SECONDARY} data-autofocus>
        <span aria-hidden="true">← </span>All books
      </button>
      <h3 className="font-display mt-3 text-2xl font-bold leading-snug text-[#24231F]">{book.title}</h3>
      <p className="text-xs text-[#57544E]">
        {book.author}, {book.year}
      </p>
      <p className="mt-3 text-sm text-[#57544E]">Choose where to start reading.</p>
      <p role="status" className="sr-only">
        {list.loading ? 'Loading the excerpts…' : list.failed ? '' : `${plural(list.items.length, 'excerpt', 'excerpts')}${list.hasMore ? ' so far' : ''}`}
      </p>

      {list.failed ? (
        <div role="alert" className="mt-3 rounded border border-[#E0D4BE] bg-[#FAF6EE] px-3 py-3 text-sm text-[#6C3438]">
          The excerpts could not be loaded.{' '}
          <button type="button" onClick={list.retry} className="underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : list.loading && list.items.length === 0 ? (
        <p className="mt-3 text-xs text-[#57544E]">Loading the excerpts…</p>
      ) : (
        <ul aria-busy={list.loading} className="mt-3 space-y-2">
          {list.items.map(item => (
            <li key={item.id}>
              <button type="button" onClick={() => onChoose(item)} className={ROW}>
                <span className="block text-sm font-medium text-[#24231F]">{excerptLabel(item)}</span>
                <span className="block text-xs leading-snug text-[#57544E]">{item.description}</span>
                {item.wordCount !== undefined && <span className="block text-[11px] text-[#605C53]">{plural(item.wordCount, 'word', 'words')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {list.hasMore && (
        <div className="py-4 text-center">
          <button type="button" onClick={list.loadMore} disabled={list.more === 'loading'} className={SECONDARY}>
            {list.more === 'loading' ? 'Loading…' : 'Show more excerpts'}
          </button>
          {list.more === 'failed' && (
            <p role="alert" className="mt-2 text-xs text-[#6C3438]">
              More excerpts could not be loaded. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
