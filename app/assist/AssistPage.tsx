'use client';

import { useState } from 'react';
import type { Passage } from '@/lib/models';
import { AssistBody } from '@/components/AssistBody';
import { AccountControl } from '@/components/AccountControl';
import { PassageTabs, SiteHeader } from '@/components/SiteHeader';
import { CollectionForPage } from '@/components/CollectionLink';
import { useAssistedPoems } from '@/components/useAssistedPoems';
import { discoverHash, passageIdFromHash, readDiscoverPassage } from '@/lib/handoff';
import { plural } from '@/components/PageDnaStrip';
import { useLibrary } from '@/components/useLibrary';
import { usePassageChoice } from '@/components/usePassageChoice';
import { PassageSwitcher } from '@/components/PassageSwitcher';
import { ChooseBookScreen } from '@/components/ChooseBookScreen';
import { bookService } from '@/lib/services';
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
  if (!bookService.hasRemoteLibrary && library.library.summaries.length === 0) {
    return <AssistMessage role="alert">The library has no passages yet.</AssistMessage>;
  }
  return <Assist library={library.library} />;
}

function Assist({ library }: { library: PassageLibrary }) {
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
          page="Assisted"
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
  const remote = bookService.hasRemoteLibrary;
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
    <div className="min-h-screen text-[#24231F] flex flex-col pb-8 px-4 sm:px-8">
      <SiteHeader
        current="assist"
        title="Poems you can erase your way to"
        actions={
          <>
            <CollectionForPage library={library} />
            <AccountControl />
            {!remote && <PassageTabs passages={summaries.map(p => ({ id: p.id, title: p.attribution.title }))} activeId={chosenId} onChoose={choosePassage} label="Passage" />}
          </>
        }
      />

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
          Here words may be skipped. Keep some of the words of <i>{passage.attribution.title}</i> in the order
          they come, erase everything between them, and what is left can fall into three lines of 5, 7 and 5
          syllables. These are 5–7–5 poems made that way.
        </p>

        <div key={passage.id} className="page-turn">
          <AssistBody
            passage={passage}
            state={state}
            otherPassages={remote ? [] : summaries.filter(p => p.id !== passage.id)}
            onChoosePassage={choosePassage}
          />
        </div>
      </main>
    </div>
  );
}
