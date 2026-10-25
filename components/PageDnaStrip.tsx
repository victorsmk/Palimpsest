'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { layoutPageDnaBlocks, type PageDnaBlock } from '@/lib/search/found';
import type { PageDnaState } from './usePageDna';

const TRACK_PADDING = 4;
const ROW_GAP = 3;

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A fraction as a CSS percentage, without floating-point noise. */
const percent = (fraction: number) => `${Math.round(fraction * 100000) / 1000}%`;

interface PageDnaTrackProps {
  blocks: PageDnaBlock[];
  /** Spoken description of the strip as a whole. */
  description: string;
  /** Track height in pixels (taller if the blocks need more rows than this leaves room for). */
  height?: number;
  /**
   * The smallest a block may be drawn, in pixels, in both directions. Short poems on a narrow strip
   * are widened to this and the rows rearranged, so every block stays big enough to tap.
   */
  minBlockPx?: number;
  /** Number the blocks 1..n, in reading order. */
  numbered?: boolean;
  /** Makes each block a button that selects its poem. Without it the strip is a picture. */
  onSelectPoem?: (familyId: string) => void;
  /** The poem to outline (the one being hovered or read). */
  activePoemId?: string | null;
  onHoverPoem?: (familyId: string | null) => void;
}

/**
 * The strip itself: the passage as a track with one block per poem to find, placed where the poem
 * sits. Darker means more ways to read it. Poems that overlap are drawn in separate rows so
 * darkness means only one thing.
 */
export function PageDnaTrack({
  blocks,
  description,
  height = 34,
  minBlockPx,
  numbered = false,
  onSelectPoem,
  activePoemId = null,
  onHoverPoem,
}: PageDnaTrackProps) {
  // The minimum size is in pixels, so the strip has to know its own width. A callback ref watches it
  // (until the first measurement the blocks are drawn at their true size).
  const [trackWidth, setTrackWidth] = useState(0);
  const watchWidth = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !minBlockPx || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(entries => setTrackWidth(entries[0].contentRect.width));
      observer.observe(element);
      return () => observer.disconnect();
    },
    [minBlockPx]
  );

  // Half a pixel of headroom, so rounding the percentages can never leave a block a hair under the minimum.
  const minFraction = minBlockPx && trackWidth > 0 ? (minBlockPx + 0.5) / trackWidth : 0;
  const { placed, rows } = layoutPageDnaBlocks(blocks, minFraction);
  const neededHeight = minBlockPx ? 2 * TRACK_PADDING + rows * minBlockPx + (rows - 1) * ROW_GAP : 0;
  const trackHeight = Math.max(height, neededHeight);
  const rowHeight = (trackHeight - 2 * TRACK_PADDING - (rows - 1) * ROW_GAP) / rows;
  const interactive = onSelectPoem !== undefined;

  return (
    <div
      ref={watchWidth}
      role={interactive ? 'group' : 'img'}
      aria-label={description}
      className="relative w-full rounded-[5px] bg-[#E4D8C2]"
      style={{ height: trackHeight }}
    >
      {placed.map(({ block, row, start, end }, index) => {
        const style = {
          left: percent(start),
          width: percent(end - start),
          top: TRACK_PADDING + row * (rowHeight + ROW_GAP),
          height: rowHeight,
          opacity: Math.min(1, 0.5 + 0.12 * block.variants),
        };
        const className = 'absolute block rounded-[2px] bg-[#6C3438]';
        // A cream chip with dark text, so the number reads on a block of any shade.
        const label = numbered ? (
          <span
            className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#FAF6EE] text-[10px] font-bold leading-none text-[#24231F]"
            aria-hidden="true"
          >
            {index + 1}
          </span>
        ) : null;

        if (!interactive) {
          return (
            <i key={block.familyId} data-poem={block.familyId} className={`${className} flex items-center justify-center`} style={style}>
              {label}
            </i>
          );
        }

        const active = activePoemId === block.familyId;
        return (
          <button
            key={block.familyId}
            type="button"
            data-poem={block.familyId}
            data-active={active}
            aria-label={`Go to poem ${index + 1}`}
            onClick={() => onSelectPoem(block.familyId)}
            onMouseEnter={() => onHoverPoem?.(block.familyId)}
            onMouseLeave={() => onHoverPoem?.(null)}
            onFocus={() => onHoverPoem?.(block.familyId)}
            onBlur={() => onHoverPoem?.(null)}
            className={`${className} flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#24231F]`}
            style={{
              ...style,
              ...(active ? { outline: '2px solid #24231F', outlineOffset: 1, zIndex: 1 } : null),
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Page DNA" in the Studio's sidebar: how many poems there are to find in the passage, and where.
 * The headline says it in plain words; the strip shows each poem as a block at its place in the
 * passage; the per-100-words figure is only a hover detail.
 */
export function PageDnaStrip({
  state,
  discoverHref,
}: {
  state: PageDnaState;
  /** Where to read the poems: a link under the strip, shown when there are poems to find. */
  discoverHref?: string;
}) {
  const ready = state.status === 'ready' ? state.pageDna : null;

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

      <PageDnaTrack blocks={ready?.blocks ?? []} description={`Page DNA strip. ${description}`} />

      <div className="flex justify-between text-[10px] text-[#605C53]" aria-hidden="true">
        <span>start of passage</span>
        <span>end</span>
      </div>

      {ready && ready.poemsToFind > 0 && ready.wordsPerPoem !== null && (
        <p className="text-xs text-[#57544E]">
          about one every {ready.wordsPerPoem} {plural(ready.wordsPerPoem, 'word', 'words')}
        </p>
      )}

      {ready && ready.poemsToFind > 0 && discoverHref && (
        <Link
          href={discoverHref}
          className="self-start rounded py-1 text-xs font-medium text-[#6C3438] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
        >
          Read these poems in Discover →
        </Link>
      )}
    </div>
  );
}
