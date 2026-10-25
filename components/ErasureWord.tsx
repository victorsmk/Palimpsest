'use client';

import type { ErasureStyle, Token } from '@/lib/models';

interface ErasureWordProps {
  token: Token;
  isRetained: boolean;
  style: ErasureStyle;
  onToggle: (tokenId: string) => void;
  /** 0 for the single tab stop of the page, -1 for the rest (roving tabindex). */
  tabIndex: 0 | -1;
  onFocus: (tokenId: string) => void;
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]';

export function ErasureWord({
  token,
  isRetained,
  style,
  onToggle,
  tabIndex,
  onFocus,
}: ErasureWordProps) {
  if (token.kind === 'separator') {
    return (
      <span aria-hidden="true" className="text-[#605C53] mx-1 select-none">
        {token.text}
      </span>
    );
  }

  // Every state shares one layout box (the padding and margin below). Only paint differs
  // between states: colour, backgrounds, text decoration. Paint never moves text, so keeping,
  // erasing or restoring a word, or changing the erasure style, leaves every word where it was.
  // The bars are backgrounds inset from the box's top and bottom so that rows stay distinct.
  let paint: string;
  if (isRetained) {
    // Crisp ink
    paint = 'rounded text-[#24231F] hover:bg-[#E4D8C2]/60 transition-colors';
  } else if (style === 'blackout') {
    paint =
      'text-transparent select-none hover:opacity-75 transition-opacity ' +
      '[background:linear-gradient(#24231F,#24231F)_center/100%_calc(100%_-_6px)_no-repeat]';
  } else if (style === 'whiteout') {
    paint =
      'text-transparent select-none hover:opacity-80 transition-opacity ' +
      '[background:linear-gradient(#FFFFFF,#FFFFFF)_center/calc(100%_-_2px)_calc(100%_-_8px)_no-repeat,linear-gradient(#DDD5C5,#DDD5C5)_center/100%_calc(100%_-_6px)_no-repeat]';
  } else {
    paint =
      'rounded text-[#8B867C]/30 line-through decoration-[#B5B0A4]/40 hover:text-[#8B867C]/60 hover:bg-[#E4D8C2]/30 transition-colors duration-150';
  }

  return (
    <button
      type="button"
      data-token-id={token.id}
      // Pressed means kept. Erased words keep their text in the DOM, so screen
      // readers hear the same word with an unpressed state.
      aria-pressed={isRetained}
      tabIndex={tabIndex}
      onFocus={() => onFocus(token.id)}
      onClick={() => onToggle(token.id)}
      title={isRetained ? 'Press to erase this word' : 'Press to keep this word'}
      className={`inline-block mr-1.5 px-0.5 cursor-pointer ${paint} ${FOCUS_RING}`}
    >
      {token.text}
    </button>
  );
}
