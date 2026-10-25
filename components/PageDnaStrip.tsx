'use client';

import { layoutPageDnaBlocks } from '@/lib/search/found';
import type { PageDnaState } from './usePageDna';

const TRACK_HEIGHT = 34;
const TRACK_PADDING = 4;
const ROW_GAP = 3;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A fraction as a CSS percentage, without floating-point noise. */
const percent = (fraction: number) => `${Math.round(fraction * 100000) / 1000}%`;

/**
 * "Page DNA": how many poems there are to find in the passage, and where. The headline says it in
 * plain words; the strip shows each poem as a block at its place in the passage (darker means more
 * ways to read it); the per-100-words figure is only a hover detail.
 */
export function PageDnaStrip({ state }: { state: PageDnaState }) {
  const ready = state.status === 'ready' ? state.pageDna : null;
  const { placed, rows } = layoutPageDnaBlocks(ready?.blocks ?? []);
  const rowHeight = (TRACK_HEIGHT - 2 * TRACK_PADDING - (rows - 1) * ROW_GAP) / rows;

  let headline: React.ReactNode;
  let description: string;
  if (state.status === 'loading') {
    headline = <span className="text-sm text-[#57544E]">Looking for poems…</span>;
    description = 'Looking for poems to find in this passage.';
  } else if (state.status === 'unavailable' || !ready) {
    headline = <span className="text-sm text-[#57544E]">Poems to find are unavailable</span>;
    description = 'Poems to find could not be worked out for this passage.';
  } else if (ready.poemsToFind === 0) {
    headline = <span className="text-sm text-[#24231F]">No poems to find here</span>;
    description = 'No poems to find in this passage.';
  } else {
    headline = (
      <>
        <span className="text-2xl font-serif font-bold text-[#6C3438]">{ready.poemsToFind}</span>
        {/* A real space, not a margin: assistive technology would read "3poems" otherwise. */}{' '}
        <span className="text-sm text-[#24231F]">
          {plural(ready.poemsToFind, 'poem', 'poems')} to find
        </span>
      </>
    );
    description = `${ready.poemsToFind} ${plural(ready.poemsToFind, 'poem', 'poems')} to find, about one every ${ready.wordsPerPoem} ${plural(ready.wordsPerPoem ?? 0, 'word', 'words')}.`;
  }

  // The number is for the curious: one line of hover text, not part of the headline.
  const hover = ready
    ? `Each block is a poem to find, where it sits in the passage. That is ${ready.per100Words} per 100 words.`
    : undefined;

  return (
    <div className="flex flex-col gap-1.5" title={hover} aria-busy={state.status === 'loading'}>
      <span
        id="page-dna-label"
        className="text-[11px] uppercase tracking-wider text-[#57544E] font-semibold"
      >
        Page DNA
      </span>

      <div className="leading-tight">{headline}</div>

      <div
        role="img"
        aria-label={`Page DNA strip. ${description}`}
        className="relative w-full rounded-[5px] bg-[#E4D8C2]"
        style={{ height: TRACK_HEIGHT }}
      >
        {placed.map(({ block, row }) => (
          <i
            key={block.familyId}
            data-poem={block.familyId}
            className="absolute block rounded-[2px] bg-[#6C3438]"
            style={{
              left: percent(block.startFraction),
              width: percent(block.endFraction - block.startFraction),
              top: TRACK_PADDING + row * (rowHeight + ROW_GAP),
              height: rowHeight,
              opacity: Math.min(1, 0.5 + 0.12 * block.variants),
            }}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-[#605C53]" aria-hidden="true">
        <span>start of passage</span>
        <span>end</span>
      </div>

      {ready && ready.poemsToFind > 0 && ready.wordsPerPoem !== null && (
        <p className="text-xs text-[#57544E]">
          about one every {ready.wordsPerPoem} {plural(ready.wordsPerPoem, 'word', 'words')}
        </p>
      )}
    </div>
  );
}
