'use client';

import { useEffect, useRef, useState } from 'react';
import type { Passage } from '@/lib/models';
import { AssistedPoemCard } from './AssistedPoemCard';
import { useUncertainAssistedPoems } from './useAssistedPoems';

interface AssistUncertainProps {
  passage: Passage;
  wordCount: number;
  /** The search for these poems. Replaceable so that it can be tested without running it. */
  useUncertain?: typeof useUncertainAssistedPoems;
}

/**
 * Poems that are 5–7–5 only if a word is counted a certain way. They are not looked for until the
 * reader asks, and then listed apart from the main poems. Remount it (key by passage) when the
 * passage changes.
 */
export function AssistUncertain({ passage, wordCount, useUncertain = useUncertainAssistedPoems }: AssistUncertainProps) {
  const [asked, setAsked] = useState(false);
  const state = useUncertain(passage, asked);
  const region = useRef<HTMLElement>(null);

  // The button that was pressed goes away, so keep the reader's place by moving to what replaces it.
  useEffect(() => {
    if (asked) region.current?.focus();
  }, [asked]);

  if (state.status === 'idle') {
    return (
      <section className="mt-6 border-t border-[#E4D8C2] pt-5">
        <button
          type="button"
          onClick={() => setAsked(true)}
          className="rounded py-1 text-[14px] font-medium text-[#6C3438] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
        >
          Also show poems that depend on how a word is said
        </button>
        <p className="mt-1 max-w-2xl text-[13px] text-[#57544E]">
          Some words can be said with more than one number of syllables, or are missing from our
          dictionary. These poems rely on one way of counting them.
        </p>
      </section>
    );
  }

  return (
    <section ref={region} tabIndex={-1} aria-label="Poems that depend on how a word is said" className="mt-6 border-t border-[#E4D8C2] pt-5 outline-none">
      {state.status === 'loading' && (
        <p role="status" className="py-4 text-sm text-[#57544E]">
          Looking for more poems…
        </p>
      )}
      {state.status === 'unavailable' && (
        <p role="alert" className="py-4 text-sm text-[#6C3438]">
          These poems could not be worked out. Please reload the page.
        </p>
      )}
      {state.status === 'ready' && state.result.candidates.length === 0 && (
        <p role="status" className="py-4 text-sm text-[#57544E]">
          No poems in this passage depend on how a word is said.
        </p>
      )}
      {state.status === 'ready' && state.result.candidates.length > 0 && (
        <>
          <h2 className="font-serif text-lg font-bold">Poems that depend on how a word is said</h2>
          <p className="mb-4 mt-1 max-w-2xl text-[13px] text-[#57544E]">
            These are 5–7–5 only if a word is counted a certain way. A dotted underline marks the word. Say
            them aloud and decide for yourself.
          </p>
          <ol className="list-none space-y-3">
            {state.result.candidates.map((poem, i) => (
              <li key={poem.id}>
                <AssistedPoemCard uncertain number={i + 1} poem={poem} passage={passage} wordCount={wordCount} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
