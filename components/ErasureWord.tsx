'use client';

import React from 'react';
import type { ErasureStyle, Token } from '@/lib/models';

interface ErasureWordProps {
  token: Token;
  isRetained: boolean;
  style: ErasureStyle;
  onClick: (tokenId: string) => void;
}

export function ErasureWord({ token, isRetained, style, onClick }: ErasureWordProps) {
  if (token.kind === 'separator') {
    return (
      <span className="text-[#8B867C] mx-1 select-none">
        {token.text}
      </span>
    );
  }

  // Base styling for retained words (crisp ink)
  if (isRetained) {
    return (
      <span
        data-token-id={token.id}
        onClick={() => onClick(token.id)}
        title="Click to erase word"
        className="inline-block mr-1.5 px-0.5 rounded cursor-pointer text-[#24231F] hover:bg-[#E4D8C2]/60 font-normal transition-colors"
      >
        {token.text}
      </span>
    );
  }

  // Erased styling according to active style
  if (style === 'blackout') {
    return (
      <span
        data-token-id={token.id}
        onClick={() => onClick(token.id)}
        title="Click to restore word"
        className="inline-block mr-1.5 px-1 py-0.5 rounded-[2px] bg-[#24231F] text-transparent select-none cursor-pointer hover:opacity-75 transition-opacity"
      >
        {token.text}
      </span>
    );
  }

  if (style === 'whiteout') {
    return (
      <span
        data-token-id={token.id}
        onClick={() => onClick(token.id)}
        title="Click to restore word"
        className="inline-block mr-1.5 px-1 py-0.5 rounded-[2px] bg-[#FFFFFF] text-transparent border border-[#DDD5C5] shadow-[0_1px_2px_rgba(0,0,0,0.04)] select-none cursor-pointer hover:border-[#9C968A] transition-all"
      >
        {token.text}
      </span>
    );
  }

  // Default 'faded' style
  return (
    <span
      data-token-id={token.id}
      onClick={() => onClick(token.id)}
      title="Click to restore word"
      className="inline-block mr-1.5 px-0.5 rounded cursor-pointer text-[#8B867C]/30 line-through decoration-[#B5B0A4]/40 hover:text-[#8B867C]/60 hover:bg-[#E4D8C2]/30 transition-all duration-150"
    >
      {token.text}
    </span>
  );
}
