'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ErasureStyle, Token } from '@/lib/models';
import { ErasureWord } from './ErasureWord';

interface BookTextProps {
  /** Tokens grouped by paragraph, in reading order. */
  paragraphs: Token[][];
  retainedSet: ReadonlySet<string>;
  style: ErasureStyle;
  onToggle: (tokenId: string) => void;
}

/**
 * The page text. The words are one tab stop (roving tabindex) so that keyboard
 * users are not made to tab through hundreds of words; arrow keys move between
 * them and Space or Enter toggles the focused word.
 */
export function BookText({ paragraphs, retainedSet, style, onToggle }: BookTextProps) {
  const articleRef = useRef<HTMLElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const selectableIds = useMemo(
    () => paragraphs.flat().filter(t => t.isSelectable).map(t => t.id),
    [paragraphs]
  );
  // Falls back to the first word when nothing was focused yet, or after the
  // passage changed under a remembered word.
  const tabStopId =
    focusedId !== null && selectableIds.includes(focusedId) ? focusedId : selectableIds[0];

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;

    const words = Array.from(
      articleRef.current?.querySelectorAll<HTMLButtonElement>('button[data-token-id]') ?? []
    );
    const current = words.indexOf(e.target as HTMLButtonElement);
    if (current === -1) return;

    let next = current;
    if (e.key === 'ArrowRight') next = Math.min(current + 1, words.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(current - 1, 0);
    else if (e.key === 'Home') next = 0;
    else next = words.length - 1;

    e.preventDefault();
    words[next].focus();
  }

  return (
    <article
      ref={articleRef}
      aria-label="Passage text. Each word is a button: press it to erase or keep it."
      onKeyDown={handleKeyDown}
      className="font-literary text-[17px] leading-[2.1] text-[#24231F] select-none"
    >
      {paragraphs.map((paragraph, pIdx) => (
        <p key={pIdx} className="mb-6 indent-6">
          {paragraph.map(token => (
            <ErasureWord
              key={token.id}
              token={token}
              isRetained={retainedSet.has(token.id)}
              style={style}
              onToggle={onToggle}
              tabIndex={token.id === tabStopId ? 0 : -1}
              onFocus={setFocusedId}
            />
          ))}
        </p>
      ))}
    </article>
  );
}
