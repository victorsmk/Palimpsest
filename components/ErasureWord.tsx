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
  // Blackout and whiteout are bars drawn as backgrounds that sweep across a word when it is erased and draw back
  // when it is restored (see .ink-word in globals.css); faded ink is a change of colour.
  let paint: string;
  if (style === 'faded') {
    paint = isRetained
      ? 'rounded text-[#24231F] hover:bg-[#E4D8C2]/60 transition-colors duration-300'
      : 'rounded text-[#8B867C]/30 line-through decoration-[#B5B0A4]/40 hover:text-[#8B867C]/60 hover:bg-[#E4D8C2]/30 transition-colors duration-300';
  } else {
    paint = `ink-word ink-${style} ${
      isRetained ? 'rounded text-[#24231F] hover:bg-[#E4D8C2]/60' : 'text-transparent select-none hover:opacity-80'
    }`;
  }

  return (
    <button
      type="button"
      data-token-id={token.id}
      data-erased={!isRetained}
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
