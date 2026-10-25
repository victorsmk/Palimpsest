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

  let appearance: string;
  if (isRetained) {
    // Crisp ink
    appearance = 'px-0.5 rounded text-[#24231F] hover:bg-[#E4D8C2]/60 font-normal transition-colors';
  } else if (style === 'blackout') {
    appearance =
      'px-1 py-0.5 rounded-[2px] bg-[#24231F] text-transparent select-none hover:opacity-75 transition-opacity';
  } else if (style === 'whiteout') {
    appearance =
      'px-1 py-0.5 rounded-[2px] bg-[#FFFFFF] text-transparent border border-[#DDD5C5] shadow-[0_1px_2px_rgba(0,0,0,0.04)] select-none hover:border-[#9C968A] transition-all';
  } else {
    appearance =
      'px-0.5 rounded text-[#8B867C]/30 line-through decoration-[#B5B0A4]/40 hover:text-[#8B867C]/60 hover:bg-[#E4D8C2]/30 transition-all duration-150';
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
      className={`inline-block mr-1.5 cursor-pointer ${appearance} ${FOCUS_RING}`}
    >
      {token.text}
    </button>
  );
}
