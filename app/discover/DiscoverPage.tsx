'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Passage } from '@/lib/models';
import { DiscoverBody } from '@/components/DiscoverBody';
import { AccountControl } from '@/components/AccountControl';
import { CollectionForPage } from '@/components/CollectionLink';
import { useFoundAnalysis } from '@/components/useFoundAnalysis';
import { discoverHash, passageIdFromHash, readDiscoverPassage } from '@/lib/handoff';
import { plural } from '@/components/PageDnaStrip';
import { useLibrary } from '@/components/useLibrary';
import { usePassageChoice } from '@/components/usePassageChoice';
import { PassageSwitcher } from '@/components/PassageSwitcher';
import { ChooseBookScreen } from '@/components/ChooseBookScreen';
import { bookService } from '@/lib/services';
import type { PassageLibrary } from '@/lib/library/passageLibrary';

function DiscoverMessage({ role, children }: { role: 'status' | 'alert'; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex items-center justify-center px-6">
      <p role={role} className="text-sm text-[#57544E] text-center max-w-sm">
        {children}
      </p>
    </div>
  );
}

export default function DiscoverPage() {
  const library = useLibrary();

  if (library.status === 'loading') return <DiscoverMessage role="status">Opening the library…</DiscoverMessage>;
  if (library.status === 'error') return <DiscoverMessage role="alert">{library.message}</DiscoverMessage>;
  if (!bookService.hasRemoteLibrary && library.library.summaries.length === 0) {
    return <DiscoverMessage role="alert">The library has no passages yet.</DiscoverMessage>;
  }
  return <Discover library={library.library} />;
}

function Discover({ library }: { library: PassageLibrary }) {
  // This only renders in the browser, once the library has been listed, so the URL hash (a link, a
  // reload, the back button) can choose the passage while the initial state is set.
  const remote = bookService.hasRemoteLibrary;
  const [initialId] = useState<string | null>(() =>
    remote ? passageIdFromHash(window.location.hash) : (readDiscoverPassage(window.location.hash, library.summaries)?.id ?? library.summaries[0].id)
  );
  const choice = usePassageChoice(library, initialId);

  if (!choice.passage) {
    // With a library of books, nothing is picked for the reader: they choose, and the choice goes in the address.
    if (remote && (!choice.chosenId || choice.error)) {
      return (
        <ChooseBookScreen
          page="Discover"
          library={library}
          message={choice.error}
          onChoose={id => {
            choice.choose(id);
            window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + discoverHash(id));
          }}
        />
      );
    }
    return choice.error ? (
      <DiscoverMessage role="alert">{choice.error}</DiscoverMessage>
    ) : (
      <DiscoverMessage role="status">Opening the passage…</DiscoverMessage>
    );
  }
  return <DiscoverView library={library} passage={choice.passage} chosenId={choice.chosenId} error={choice.error} onChoose={choice.choose} />;
}

interface ViewProps {
  library: PassageLibrary;
  passage: Passage;
  chosenId: string;
  error: string | null;
  onChoose: (id: string) => void;
}

function DiscoverView({ library, passage, chosenId, error, onChoose }: ViewProps) {
  const summaries = library.summaries;
  const remote = bookService.hasRemoteLibrary;
  const state = useFoundAnalysis(passage);

  // Choosing a passage also puts it in the address bar, so the page can be reloaded or shared as is.
  function choosePassage(passageId: string) {
    onChoose(passageId);
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search + discoverHash(passageId)
    );
  }

  // Said aloud when the passage changes; the list itself appears silently.
  const announcement =
    state.status !== 'ready'
      ? ''
      : state.analysis.pageDna.poemsToFind === 0
        ? `No poems to find in ${passage.attribution.title}.`
        : `${state.analysis.pageDna.poemsToFind} ${plural(state.analysis.pageDna.poemsToFind, 'poem', 'poems')} to find in ${passage.attribution.title}.`;

  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex flex-col py-8 px-4 sm:px-8">
      <header className="max-w-4xl mx-auto w-full mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4D8C2] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-[#6C3438] font-bold">Discover</span>
            <span className="text-xs text-[#57544E]" aria-hidden="true">|</span>
            <Link href="/" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Home
            </Link>
            <Link href="/assist" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Assisted
            </Link>
            <Link href="/studio" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Studio
            </Link>
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight mt-1">Poems hiding in the text</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CollectionForPage library={library} />
          <AccountControl />
          {!remote && (
            <div role="group" aria-label="Passage" className="flex flex-wrap gap-2">
              {summaries.map(p => {
                const isSelected = p.id === chosenId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => choosePassage(p.id)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438] ${
                      isSelected
                        ? 'bg-[#24231F] text-[#F3EBDD] shadow-sm'
                        : 'bg-[#E4D8C2]/60 hover:bg-[#E4D8C2] text-[#24231F]'
                    }`}
                  >
                    {p.attribution.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {remote && (
        <div className="max-w-4xl mx-auto w-full mb-6">
          <PassageSwitcher passage={passage} onChoose={choosePassage} />
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
      {error && (
        <p role="alert" className="max-w-4xl mx-auto w-full mb-4 text-sm text-[#6C3438]">
          {error}
        </p>
      )}

      <main id="main" tabIndex={-1} className="max-w-4xl mx-auto w-full flex-1 outline-none">
        <p className="mb-5 max-w-2xl font-literary text-[17px] leading-relaxed">
          Read straight through, with nothing skipped, some stretches of these books fall into three
          lines of 5, 7 and 5 syllables. Here are the ones in <i>{passage.attribution.title}</i>.
        </p>

        <DiscoverBody
          key={passage.id}
          passage={passage}
          state={state}
          otherPassages={remote ? [] : summaries.filter(p => p.id !== passage.id)}
          onChoosePassage={choosePassage}
        />
      </main>
    </div>
  );
}
