'use client';

import React from 'react';
import type { ErasureStyle } from '@/lib/models';

interface StyleOption {
  id: ErasureStyle;
  label: string;
  description: string;
  previewClass: string;
}

const STYLES: StyleOption[] = [
  {
    id: 'blackout',
    label: 'Blackout',
    description: 'Archival ink marker bars',
    previewClass: 'bg-[#24231F] text-transparent rounded-[2px]',
  },
  {
    id: 'faded',
    label: 'Faded Ink',
    description: 'Ghost-like washed lettering',
    previewClass: 'text-[#8B867C]/40 line-through decoration-[#B5B0A4]',
  },
  {
    id: 'whiteout',
    label: 'Whiteout',
    description: 'Chalk correction fluid tape',
    previewClass: 'bg-[#FFFFFF] text-transparent border border-[#DDD5C5] rounded-[2px]',
  },
];

interface StyleSelectorProps {
  currentStyle: ErasureStyle;
  onSelectStyle: (style: ErasureStyle) => void;
}

export function StyleSelector({ currentStyle, onSelectStyle }: StyleSelectorProps) {
  return (
    <div role="group" aria-labelledby="erasure-style-label" className="flex flex-col gap-1.5">
      <span
        id="erasure-style-label"
        className="text-[11px] uppercase tracking-wider text-[#57544E] font-semibold"
      >
        Erasure Style
      </span>
      <div className="grid grid-cols-3 gap-2">
        {STYLES.map(style => {
          const isSelected = currentStyle === style.id;
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectStyle(style.id)}
              className={`flex flex-col items-center justify-center p-2.5 rounded border transition-all text-left ${
                isSelected
                  ? 'border-[#24231F] bg-[#E4D8C2]/60 shadow-sm ring-1 ring-[#24231F]'
                  : 'border-[#E0D4BE] hover:bg-[#E4D8C2]/30 bg-[#FAF6EE]'
              }`}
            >
              {/* Visual preview swatch */}
              <div aria-hidden="true" className="h-4 w-12 flex items-center justify-center text-[10px] select-none mb-1.5 font-literary">
                <span className={`px-1.5 py-0.5 ${style.previewClass}`}>Word</span>
              </div>
              <span className="text-xs font-medium text-[#24231F]">{style.label}</span>
              <span className="text-[10px] text-[#605C53] text-center leading-tight mt-0.5">
                {style.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
