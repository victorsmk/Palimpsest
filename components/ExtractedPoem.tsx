'use client';

import { Fragment, type Ref } from 'react';
import type { Attribution, Token } from '@/lib/models';

interface ExtractedPoemProps {
  /** Retained word tokens in source order. */
  tokens: Token[];
  /** Token IDs after which the poem breaks to a new line. */
  lineBreakSet: ReadonlySet<string>;
  onToggleLineBreak: (tokenId: string) => void;
  title: string;
  attribution: Attribution;
  /** The element exported as an image. */
  frameRef?: Ref<HTMLDivElement>;
}

/**
 * The retained words as verse. Line breaks are composition only: they change
 * where lines end, never the order of the words.
 */
export function ExtractedPoem({
  tokens,
  lineBreakSet,
  onToggleLineBreak,
  title,
  attribution,
  frameRef,
}: ExtractedPoemProps) {
  return (
    <div ref={frameRef} className="bg-[#FAF6EE] border border-[#E0D4BE] rounded-lg shadow-md p-8 sm:p-12 min-h-[500px] flex flex-col">
      <div className="text-center mb-8 border-b border-[#ECE3D0] pb-4">
        <h2 className="text-lg font-serif font-semibold text-[#24231F]">
          {title || 'Untitled poem'}
        </h2>
        <p className="text-xs text-[#57544E] mt-1">
          Found in {attribution.title}, {attribution.author} ({attribution.year})
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {tokens.length === 0 ? (
          <p className="text-sm text-[#57544E] italic text-center max-w-xs">
            All words are erased. Switch to the page and keep the words that belong in your poem.
          </p>
        ) : (
          <div className="font-literary text-xl leading-loose text-center text-[#24231F] max-w-md">
            {tokens.map((token, i) => {
              const breaksAfter = lineBreakSet.has(token.id);
              return (
                <Fragment key={token.id}>
                  <button
                    type="button"
                    aria-pressed={breaksAfter}
                    title="Toggle a line break after this word"
                    onClick={() => onToggleLineBreak(token.id)}
                    className="inline px-1 rounded hover:bg-[#E4D8C2] transition-colors cursor-pointer"
                  >
                    {token.text}
                    {breaksAfter && (
                      <span
                        aria-hidden="true"
                        data-export-ignore
                        className="text-xs text-[#6C3438] font-sans ml-1 font-bold"
                      >
                        ↵
                      </span>
                    )}
                  </button>
                  {breaksAfter ? <br /> : i < tokens.length - 1 ? ' ' : null}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      <p
        data-export-ignore
        className="text-center mt-8 pt-4 border-t border-[#ECE3D0] text-[11px] text-[#57544E]"
      >
        Click a word to start a new line after it. Line breaks never reorder words.
      </p>
    </div>
  );
}
