'use client';

import { useId, useMemo, useState } from 'react';
import type { Passage } from '@/lib/models';
import { foundCandidateTokens, type FoundFamily, type PageDnaBlock } from '@/lib/search/found';
import { FoundPoemCard } from './FoundPoemCard';
import { plural } from './PageDnaStrip';

const noop = () => {};

interface UncertainPoemsProps {
  passage: Passage;
  families: FoundFamily[];
  wordCount: number;
}

/**
 * The poems that are 5–7–5 only if a word is counted a certain way. They are kept out of the poems to
 * find, the Page DNA and the strip, which describe only what is certainly there, and tucked behind a
 * button until the reader asks. Renders nothing when there are none.
 */
export function UncertainPoems({ passage, families, wordCount }: UncertainPoemsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const blocks = useMemo(() => {
    const wordIndex = new Map(
      passage.tokens.filter(t => t.isSelectable && t.kind === 'word').map((t, i) => [t.id, i])
    );
    return families.map((family): PageDnaBlock => {
      const tokens = foundCandidateTokens(family.representative);
      const startWord = wordIndex.get(tokens[0].id) ?? 0;
      const endWord = wordIndex.get(tokens[tokens.length - 1].id) ?? startWord;
      return {
        familyId: family.id,
        startWord,
        endWord,
        startFraction: startWord / wordCount,
        endFraction: (endWord + 1) / wordCount,
        variants: family.members.length - 1,
      };
    });
  }, [families, passage.tokens, wordCount]);

  if (families.length === 0) return null;
  const count = families.length;

  return (
    <section className="mt-6 border-t border-[#E4D8C2] pt-5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(isOpen => !isOpen)}
        className="rounded py-1 text-[14px] font-medium text-[#6C3438] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'} </span>
        {count} more {plural(count, 'poem depends', 'poems depend')} on how a word is said
      </button>

      <div id={panelId} hidden={!open} className="mt-3">
        <p className="mb-4 max-w-2xl text-[13px] text-[#57544E]">
          These are 5–7–5 only if a word is counted a certain way. Say them aloud and decide for yourself.
        </p>
        <ol className="list-none space-y-3">
          {families.map((family, i) => (
            <li key={family.id}>
              <FoundPoemCard
                uncertain
                number={i + 1}
                family={family}
                block={blocks[i]}
                passage={passage}
                wordCount={wordCount}
                active={false}
                onActiveChange={noop}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
