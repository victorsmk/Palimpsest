'use client';

import { useState } from 'react';
import type { Passage, PassageSummary } from '@/lib/models';
import { FoundPoemCard, poemCardId } from './FoundPoemCard';
import { PageDnaTrack, plural } from './PageDnaStrip';
import { UncertainPoems } from './UncertainPoems';
import type { FoundAnalysisState } from './useFoundAnalysis';

interface DiscoverBodyProps {
  passage: Passage;
  state: FoundAnalysisState;
  /** The other passages, offered when there is nothing to find in this one. */
  otherPassages: PassageSummary[];
  onChoosePassage: (passageId: string) => void;
}

/**
 * What Discover shows for one passage: the Page DNA (the number of poems to find and the strip that
 * shows where), then one card per poem, or a plain explanation when there are none. Remount it
 * (key by passage) when the passage changes so that nothing carries over.
 */
export function DiscoverBody({ passage, state, otherPassages, onChoosePassage }: DiscoverBodyProps) {
  const [activePoemId, setActivePoemId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <p role="status" className="py-12 text-center text-sm text-[#57544E]">
        Looking for poems…
      </p>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <p role="alert" className="py-12 text-center text-sm text-[#6C3438]">
        The poems in this passage could not be worked out. Please reload the page.
      </p>
    );
  }

  const { analysis } = state;
  const { families, pageDna, wordCount } = analysis;
  const uncertain = (
    <UncertainPoems passage={passage} families={analysis.uncertainFamilies} wordCount={wordCount} />
  );

  if (families.length === 0) {
    return (
      <>
        <section className="card-gilt rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] px-6 py-10 text-center">
          <h2 className="font-serif text-xl font-bold">No poems to find here</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#57544E]">
            {analysis.hiddenByWeakEnding > 0
              ? 'Some stretches of this passage fall into three lines of 5, 7 and 5 syllables, but every one of them ends a line on a word like “the” or “and”.'
              : 'Nothing in this passage falls into three lines of 5, 7 and 5 syllables when it is read straight through.'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#57544E]">
            Words our dictionary does not know can also hide poems.
          </p>
          {otherPassages.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {otherPassages.map(other => (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => onChoosePassage(other.id)}
                  className="rounded-md border border-[#24231F] px-3 py-1.5 text-xs text-[#24231F] hover:bg-[#E4D8C2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
                >
                  Try {other.attribution.title}
                </button>
              ))}
            </div>
          )}
        </section>
        {uncertain}
      </>
    );
  }

  // Scroll to a poem's card and move focus there, so the strip works for keyboard users too.
  function goToPoem(familyId: string) {
    const card = document.getElementById(poemCardId(familyId));
    if (!card) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    card.focus({ preventScroll: true });
  }

  const noun = plural(pageDna.poemsToFind, 'poem', 'poems');
  return (
    <div className="space-y-4">
      <section
        aria-labelledby="discover-dna-heading"
        className="card-gilt rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-4 sm:flex sm:items-center sm:gap-6"
      >
        <div className="mb-3 shrink-0 sm:mb-0">
          <h2 id="discover-dna-heading" className="leading-none">
            <span className="font-serif text-3xl font-bold text-[#6C3438]">{pageDna.poemsToFind}</span>
            {/* A real space, so assistive technology reads "9 poems", not "9poems". */}{' '}
            <span className="text-sm text-[#24231F]">{noun} to find</span>
          </h2>
          <p className="mt-1 whitespace-nowrap text-[13px] text-[#57544E]">
            about one every {pageDna.wordsPerPoem} {plural(pageDna.wordsPerPoem ?? 0, 'word', 'words')}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <PageDnaTrack
            blocks={pageDna.blocks}
            height={60}
            minBlockPx={24}
            numbered
            description={`Page DNA strip. ${pageDna.poemsToFind} ${noun} to find, about one every ${pageDna.wordsPerPoem} words. Each block goes to its poem.`}
            onSelectPoem={goToPoem}
            activePoemId={activePoemId}
            onHoverPoem={setActivePoemId}
          />
          <div className="mt-1 flex justify-between text-[11px] text-[#605C53]" aria-hidden="true">
            <span>start of passage</span>
            <span>end</span>
          </div>
        </div>
      </section>

      <p className="text-xs text-[#605C53]">Click a block to jump to that poem.</p>

      <ol className="list-none space-y-3">
        {families.map((family, i) => (
          <li key={family.id}>
            <FoundPoemCard
              number={i + 1}
              family={family}
              block={pageDna.blocks[i]}
              passage={passage}
              wordCount={wordCount}
              active={activePoemId === family.id}
              onActiveChange={setActivePoemId}
            />
          </li>
        ))}
      </ol>

      {uncertain}
    </div>
  );
}
