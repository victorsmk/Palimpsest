'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { PassageLibrary } from '@/lib/library/passageLibrary';
import { AccountControl } from './AccountControl';
import { BookBrowser } from './BookBrowser';
import { CollectionForPage } from './CollectionLink';

export type PageName = 'Discover' | 'Assisted' | 'Studio';

const PAGES: { name: PageName; href: string; label: string }[] = [
  { name: 'Discover', href: '/discover', label: 'Discover' },
  { name: 'Assisted', href: '/assist', label: 'Assisted' },
  { name: 'Studio', href: '/studio', label: 'Studio' },
];

const INTRO: Record<PageName, string> = {
  Discover: 'Find the poems that are already hiding in a book, in lines of five, seven and five syllables.',
  Assisted: 'Pick a book, and have the poems in it suggested to you as you erase.',
  Studio: 'Pick a book, then erase the words around the ones that make your poem.',
};

interface ChooseBookScreenProps {
  page: PageName;
  library: PassageLibrary;
  /** Why the page could not open what was asked for, if it could not. */
  message?: string | null;
  /** Called with the id of the excerpt the reader picked. */
  onChoose: (id: string) => void;
}

/**
 * What a page shows before a book is chosen, when there is a library to choose from: the header the page has,
 * and the book search. Nothing is picked for the reader.
 */
export function ChooseBookScreen({ page, library, message, onChoose }: ChooseBookScreenProps) {
  // A link that could not be used (a saved poem when nobody is signed in, say) is taken out of the address, so that
  // following it again, once the reason is gone, is a new address and is acted on.
  useEffect(() => {
    if (page === 'Studio' && window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [page]);

  // A saved poem chosen in My Collection arrives as a new address on this same page: load the page again so that it is opened.
  useEffect(() => {
    if (page !== 'Studio') return;
    const onHashChange = () => {
      if (/^#(open|poem)=/.test(window.location.hash)) window.location.reload();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [page]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F3EBDD] px-4 py-8 text-[#24231F] sm:px-8">
      <header className="mx-auto mb-6 flex w-full max-w-4xl flex-col justify-between gap-4 border-b border-[#E4D8C2] pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#6C3438]">{page}</span>
            <span className="text-xs text-[#57544E]" aria-hidden="true">
              |
            </span>
            <Link href="/" className="text-xs text-[#57544E] underline transition-colors hover:text-[#24231F]">
              Home
            </Link>
            {PAGES.filter(other => other.name !== page).map(other => (
              <Link key={other.name} href={other.href} className="text-xs text-[#57544E] underline transition-colors hover:text-[#24231F]">
                {other.label}
              </Link>
            ))}
          </div>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">Choose a book to begin</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <CollectionForPage library={library} />
          <AccountControl />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 outline-none">
        <p className="mb-5 max-w-2xl font-literary text-[17px] leading-relaxed">{INTRO[page]}</p>
        {message && (
          <p role="alert" className="mb-4 text-sm text-[#6C3438]">
            {message}
          </p>
        )}
        <BookBrowser autoFocus onChoose={passage => onChoose(passage.id)} />
      </main>
    </div>
  );
}
