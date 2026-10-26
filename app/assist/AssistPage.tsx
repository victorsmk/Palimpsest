'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Passage } from '@/lib/models';
import { AssistBody } from '@/components/AssistBody';
import { AccountControl } from '@/components/AccountControl';
import { CollectionForPage } from '@/components/CollectionLink';
import { useAssistedPoems } from '@/components/useAssistedPoems';
import { discoverHash, readDiscoverPassage } from '@/lib/handoff';
import { plural } from '@/components/PageDnaStrip';
import { useLibrary } from '@/components/useLibrary';
import { usePassageChoice } from '@/components/usePassageChoice';
import type { PassageLibrary } from '@/lib/library/passageLibrary';

function AssistMessage({ role, children }: { role: 'status' | 'alert'; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex items-center justify-center px-6">
      <p role={role} className="text-sm text-[#57544E] text-center max-w-sm">
        {children}
      </p>
    </div>
  );
}

export default function AssistPage() {
  const library = useLibrary();

  if (library.status === 'loading') return <AssistMessage role="status">Opening the library…</AssistMessage>;
  if (library.status === 'error') return <AssistMessage role="alert">{library.message}</AssistMessage>;
  if (library.library.summaries.length === 0) {
    return <AssistMessage role="alert">The library has no passages yet.</AssistMessage>;
  }
  return <Assist library={library.library} />;
}

function Assist({ library }: { library: PassageLibrary }) {
  // This only renders in the browser, once the library has been listed, so the URL hash (a link, a
  // reload, the back button) can choose the passage while the initial state is set.
  const [initialId] = useState<string>(
    () => readDiscoverPassage(window.location.hash, library.summaries)?.id ?? library.summaries[0].id
  );
  const choice = usePassageChoice(library, initialId);

  if (!choice.passage) {
    return choice.error ? (
      <AssistMessage role="alert">{choice.error}</AssistMessage>
    ) : (
      <AssistMessage role="status">Opening the passage…</AssistMessage>
    );
  }
  return <AssistView library={library} passage={choice.passage} chosenId={choice.chosenId} error={choice.error} onChoose={choice.choose} />;
}

interface ViewProps {
  library: PassageLibrary;
  passage: Passage;
  chosenId: string;
  error: string | null;
  onChoose: (id: string) => void;
}

function AssistView({ library, passage, chosenId, error, onChoose }: ViewProps) {
  const summaries = library.summaries;
  const state = useAssistedPoems(passage);

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
  const count = state.status === 'ready' ? state.result.candidates.length : 0;
  const announcement =
    state.status !== 'ready'
      ? ''
      : count === 0
        ? `No poems to make from ${passage.attribution.title}.`
        : `${count} ${plural(count, 'poem', 'poems')} to make from ${passage.attribution.title}.`;

  return (
    <div className="min-h-screen bg-[#F3EBDD] text-[#24231F] flex flex-col py-8 px-4 sm:px-8">
      <header className="max-w-4xl mx-auto w-full mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4D8C2] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-[#6C3438] font-bold">Assisted</span>
            <span className="text-xs text-[#57544E]" aria-hidden="true">|</span>
            <Link href="/" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Home
            </Link>
            <Link href="/discover" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Discover
            </Link>
            <Link href="/studio" className="text-xs text-[#57544E] hover:text-[#24231F] underline transition-colors">
              Studio
            </Link>
          </div>
          <h1 className="text-3xl font-serif font-bold tracking-tight mt-1">Poems you can erase your way to</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CollectionForPage library={library} />
          <AccountControl />
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
        </div>
      </header>

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
          Here words may be skipped. Keep some of the words of <i>{passage.attribution.title}</i> in the order
          they come, erase everything between them, and what is left can fall into three lines of 5, 7 and 5
          syllables. These are 5–7–5 poems made that way.
        </p>

        <AssistBody
          key={passage.id}
          passage={passage}
          state={state}
          otherPassages={summaries.filter(p => p.id !== passage.id)}
          onChoosePassage={choosePassage}
        />
      </main>
    </div>
  );
}
