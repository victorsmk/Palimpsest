'use client';

import { useState } from 'react';
import type { Passage } from '@/lib/models';
import { AssistedPoemCard } from './AssistedPoemCard';
import { AssistUncertain } from './AssistUncertain';
import { plural } from './PageDnaStrip';
import type { AssistedPoemsState, useUncertainAssistedPoems } from './useAssistedPoems';

/** How many poems show at first, and how many more each press of "Show more" adds. */
export const FIRST_PAGE = 6;
export const PAGE_STEP = 6;

interface AssistBodyProps {
  passage: Passage;
  state: AssistedPoemsState;
  /** The other passages, offered when there is nothing to make from this one. */
  otherPassages: Passage[];
  onChoosePassage: (passageId: string) => void;
  /** The search for poems that depend on how a word is said. Replaceable so that it can be tested without running it. */
  useUncertain?: typeof useUncertainAssistedPoems;
}

/**
 * What the Assisted page shows for one passage: how many poems it found, then a card for each (a few
 * at a time), or a plain explanation when there are none. Remount it (key by passage) when the
 * passage changes so that nothing carries over.
 */
export function AssistBody({ passage, state, otherPassages, onChoosePassage, useUncertain }: AssistBodyProps) {
  const [shown, setShown] = useState(FIRST_PAGE);

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

  const { candidates, stats } = state.result;

  if (candidates.length === 0) {
    return (
      <section className="rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] px-6 py-10 text-center">
        <h2 className="font-serif text-xl font-bold">No poems to make here</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#57544E]">
          We could not put together three lines of 5, 7 and 5 syllables from words of this passage kept in order.
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
    );
  }

  const visible = candidates.slice(0, shown);
  const remaining = candidates.length - visible.length;
  const noun = plural(candidates.length, 'poem', 'poems');

  return (
    <div className="space-y-4">
      <section aria-labelledby="assist-count-heading" className="rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-4">
        <h2 id="assist-count-heading" className="leading-none">
          <span className="font-serif text-3xl font-bold text-[#6C3438]">{candidates.length}</span>
          {/* A real space, so assistive technology reads "10 poems", not "10poems". */}{' '}
          <span className="text-sm text-[#24231F]">{noun} to make</span>
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] text-[#57544E]">
          A selection, not every possible poem: a passage this size hides far more than could be listed.
          These are the best of the ones we looked at, judged by simple rules (how lines end, how much is
          skipped), and picked so that no two are much alike.
          {stats.workLimitReached && ' The search hit its limit in places, so some poems may be missing.'}
        </p>
        <p className="mt-2 text-xs text-[#605C53]">
          In each poem, the <mark className="rounded-sm bg-[#6C3438]/20 px-0.5 font-semibold">highlighted</mark>{' '}
          words are kept; <span className="line-through decoration-[#8B867C]">struck-through</span> words are
          the ones erased.
        </p>
      </section>

      <ol className="list-none space-y-3">
        {visible.map((poem, i) => (
          <li key={poem.id}>
            <AssistedPoemCard number={i + 1} poem={poem} passage={passage} wordCount={stats.wordCount} />
          </li>
        ))}
      </ol>

      {/* Said aloud when more poems appear, since the button that was pressed stays where it is. */}
      <p role="status" className="sr-only">
        {shown > FIRST_PAGE ? `Showing ${visible.length} of ${candidates.length} ${noun}.` : ''}
      </p>

      {remaining > 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShown(count => count + PAGE_STEP)}
            className="rounded-md border border-[#24231F] px-5 py-2 text-[13px] font-medium text-[#24231F] hover:bg-[#E4D8C2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
          >
            Show {Math.min(PAGE_STEP, remaining)} more {plural(Math.min(PAGE_STEP, remaining), 'poem', 'poems')}
          </button>
        </div>
      )}

      {stats.uncertainWords > 0 && (
        <AssistUncertain passage={passage} wordCount={stats.wordCount} useUncertain={useUncertain} />
      )}
    </div>
  );
}
