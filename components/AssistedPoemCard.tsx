'use client';

import { Fragment, useMemo } from 'react';
import Link from 'next/link';
import type { Passage } from '@/lib/models';
import type { AssistedCandidate } from '@/lib/search/assisted';
import { assistedHandoffFromCandidate, assistedHandoffHref } from '@/lib/handoff';
import { UncertaintyNotes } from './UncertaintyNotes';

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

const textOf = (tokens: { text: string }[]) => tokens.map(t => t.text).join(' ');

interface AssistedPoemCardProps {
  /** Position in the list, from 1. */
  number: number;
  poem: AssistedCandidate;
  passage: Passage;
  wordCount: number;
  /** A poem that depends on how a word is said: named "Uncertain poem N", with a note on each such word. */
  uncertain?: boolean;
}

/**
 * One poem made by erasure: its three lines, then the stretch of the passage it was taken from with
 * the kept words marked and the skipped words struck through, so what was erased can be seen.
 */
export function AssistedPoemCard({ number, poem, passage, wordCount, uncertain = false }: AssistedPoemCardProps) {
  const lines = [poem.line1, poem.line2, poem.line3];
  const noun = uncertain ? 'Uncertain poem' : 'Poem';
  const headingId = `assisted-${uncertain ? 'uncertain' : 'poem'}-${number}-heading`;
  // The kept words whose syllable count is not certain, shown with a dotted underline.
  const uncertainIds = new Set(
    lines.flatMap(line => line.tokens.filter((_, i) => line.syllableResults[i]?.confidence !== 'definite').map(t => t.id))
  );
  const keptCount = lines.reduce((sum, line) => sum + line.tokens.length, 0);

  const stretch = useMemo(() => {
    const kept = new Set([poem.line1, poem.line2, poem.line3].flatMap(line => line.tokens.map(t => t.id)));
    return passage.tokens
      .filter(t => t.position >= poem.startPosition && t.position <= poem.endPosition)
      .map(token => ({ token, kept: kept.has(token.id) }));
  }, [poem, passage.tokens]);

  const spanWords = poem.endWord - poem.startWord + 1;

  return (
    <article
      aria-labelledby={headingId}
      className="lift card-gilt rounded-lg border border-[#E0D4BE] bg-[#FAF6EE] p-5"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#6C3438] text-xs font-bold text-white"
        >
          {number}
        </span>
        <h2 id={headingId} className="sr-only">
          {noun} {number}
        </h2>
        <span className="text-xs text-[#605C53]">
          words {poem.startWord + 1}–{poem.endWord + 1} of {wordCount} · keeps {keptCount} of {spanWords}
        </span>
      </div>

      <p className="font-literary text-lg leading-snug text-[#24231F] sm:text-[22px]">
        {lines.map((line, i) => (
          <Fragment key={i}>
            {textOf(line.tokens)} <br />
          </Fragment>
        ))}
      </p>

      {poem.hasUncertain && <UncertaintyNotes lines={lines} className="mt-2" />}

      <p className="mt-3 rounded-md bg-[#F3EBDD] px-3 py-2 font-literary text-sm leading-relaxed">
        {stretch.map(({ token, kept }, i) => (
          <Fragment key={token.id}>
            {i > 0 && ' '}
            {kept ? (
              <mark
                className={`rounded-sm bg-[#6C3438]/20 px-0.5 font-semibold text-[#24231F] ${
                  uncertainIds.has(token.id) ? 'underline decoration-dotted decoration-2 underline-offset-2' : ''
                }`}
              >
                {token.text}
              </mark>
            ) : (
              <span className="text-[#605C53] line-through decoration-[#8B867C]">{token.text}</span>
            )}
          </Fragment>
        ))}
      </p>

      <div className="mt-3">
        <Link
          href={assistedHandoffHref(assistedHandoffFromCandidate(poem))}
          aria-label={`Open ${noun.toLowerCase()} ${number} in the editor`}
          className={`inline-block rounded-md bg-[#6C3438] px-4 py-2 text-[13px] font-semibold text-[#F3EBDD] transition-colors hover:bg-[#57292D] ${FOCUS_RING}`}
        >
          Open in editor
        </Link>
      </div>
    </article>
  );
}
