'use client';

import { Fragment, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Passage } from '@/lib/models';
import {
  foundCandidateTokens,
  getFoundContext,
  type FoundCandidate,
  type FoundFamily,
  type PageDnaBlock,
} from '@/lib/search/found';
import { foundHandoffFromCandidate, foundHandoffHref } from '@/lib/handoff';
import { plural } from './PageDnaStrip';

/** The DOM id of a poem's card, so the strip can scroll to it. */
export const poemCardId = (familyId: string) => `poem-card-${familyId}`;

const textOf = (tokens: { text: string }[]) => tokens.map(t => t.text).join(' ');
const linesOf = (c: FoundCandidate) => [c.line1, c.line2, c.line3].map(l => textOf(l.tokens));

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

/** Three lines of verse. Each line ends in a real space as well as a break, so text reads in order. */
function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line} <br />
        </Fragment>
      ))}
    </>
  );
}

interface FoundPoemCardProps {
  /** Position in the list, from 1; matches the number on the strip. */
  number: number;
  family: FoundFamily;
  /** The family's block on the strip, for where the poem sits. */
  block: PageDnaBlock;
  passage: Passage;
  wordCount: number;
  active: boolean;
  onActiveChange: (familyId: string | null) => void;
}

/** One poem to find: its three lines, where it comes from, Open in editor, and its other readings. */
export function FoundPoemCard({
  number,
  family,
  block,
  passage,
  wordCount,
  active,
  onActiveChange,
}: FoundPoemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const variantsId = useId();
  const poem = family.representative;
  const variants = family.members.slice(1);

  const context = useMemo(() => getFoundContext(poem, passage.tokens), [poem, passage.tokens]);
  const before = textOf(context.before);
  const after = textOf(context.after);
  // An ellipsis only where the passage really goes on past the context shown.
  const firstPosition = passage.tokens[0]?.position;
  const lastPosition = passage.tokens[passage.tokens.length - 1]?.position;
  const startsBeforeContext = context.before.length > 0 && context.before[0].position !== firstPosition;
  const continuesAfterContext =
    context.after.length > 0 && context.after[context.after.length - 1].position !== lastPosition;

  return (
    <article
      id={poemCardId(family.id)}
      tabIndex={-1}
      aria-labelledby={`${poemCardId(family.id)}-heading`}
      onMouseEnter={() => onActiveChange(family.id)}
      onMouseLeave={() => onActiveChange(null)}
      onFocus={() => onActiveChange(family.id)}
      onBlur={() => onActiveChange(null)}
      data-active={active}
      className={`scroll-mt-4 rounded-lg border bg-[#FAF6EE] p-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#6C3438] ${
        active ? 'border-[#24231F] ring-1 ring-[#24231F]' : 'border-[#E0D4BE]'
      }`}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#6C3438] text-xs font-bold text-white"
        >
          {number}
        </span>
        <h2 id={`${poemCardId(family.id)}-heading`} className="sr-only">
          Poem {number}
        </h2>
        <span className="text-xs text-[#605C53]">
          words {block.startWord + 1}–{block.endWord + 1} of {wordCount}
        </span>
      </div>

      <p className="font-literary text-lg leading-snug text-[#24231F] sm:text-[22px]">
        <Lines lines={linesOf(poem)} />
      </p>

      <p className="mt-3 rounded-md bg-[#F3EBDD] px-3 py-2 font-literary text-sm leading-relaxed">
        <span className="text-[#605C53]">{before && `${startsBeforeContext ? '… ' : ''}${before} `}</span>
        <mark className="rounded-sm bg-[#6C3438]/20 px-0.5 text-[#24231F]">
          {textOf(foundCandidateTokens(poem))}
        </mark>
        <span className="text-[#605C53]">{after && ` ${after}${continuesAfterContext ? ' …' : ''}`}</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={foundHandoffHref(foundHandoffFromCandidate(poem))}
          aria-label={`Open poem ${number} in the editor`}
          className={`rounded-md bg-[#6C3438] px-4 py-2 text-[13px] font-semibold text-[#F3EBDD] transition-colors hover:bg-[#57292D] ${FOCUS_RING}`}
        >
          Open in editor
        </Link>

        {variants.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={variantsId}
            onClick={() => setExpanded(open => !open)}
            className={`rounded text-[13px] text-[#6C3438] underline ${FOCUS_RING}`}
          >
            <span aria-hidden="true">{expanded ? '▾' : '▸'} </span>
            {variants.length} other {plural(variants.length, 'way', 'ways')} to read this
          </button>
        )}
      </div>

      {variants.length > 0 && (
        <ul
          id={variantsId}
          hidden={!expanded}
          aria-label={`Other ways to read poem ${number}`}
          className="mt-3 grid list-none gap-2 border-t border-[#ECE3D0] pt-3"
        >
          {variants.map((variant, i) => (
            <li
              key={variant.id}
              className="flex items-center justify-between gap-3 rounded-md bg-[#F3EBDD] px-3.5 py-2.5"
            >
              <p className="font-literary text-base leading-snug">
                <Lines lines={linesOf(variant)} />
              </p>
              <Link
                href={foundHandoffHref(foundHandoffFromCandidate(variant))}
                aria-label={`Open variant ${i + 1} of poem ${number} in the editor`}
                className={`shrink-0 rounded-md border border-[#24231F] px-3 py-1.5 text-xs text-[#24231F] hover:bg-[#E4D8C2]/50 ${FOCUS_RING}`}
              >
                Open in editor
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
