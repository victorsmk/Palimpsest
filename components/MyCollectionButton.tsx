'use client';

import { useState } from 'react';
import type { Passage, Poem } from '@/lib/models';
import { DraftsDrawer } from './DraftsDrawer';

interface MyCollectionButtonProps {
  /** The library's passages, so each poem can show its book and its first lines. */
  passages: Passage[];
  /** What to do when a saved poem is chosen: open it where this page is, or go to the Studio with it. */
  onOpenPoem: (poem: Poem) => void;
  /** Called after a poem is renamed in the panel (the Studio follows if that poem is the one open). */
  onRenamed?: (poem: Poem) => void;
  /** Whether the passages have been loaded. Until then the button is there but cannot be used. */
  ready?: boolean;
}

/**
 * The "My Collection" button and the panel it opens, the same on every page: the saved poems, with
 * Rename, Duplicate, Delete, back up and restore. Choosing a poem hands it to `onOpenPoem`.
 */
export function MyCollectionButton({ passages, onOpenPoem, onRenamed, ready = true }: MyCollectionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!ready}
        className="px-3.5 py-1.5 bg-[#FAF6EE] hover:bg-[#E4D8C2] border border-[#E0D4BE] rounded text-xs font-medium text-[#24231F] transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
      >
        <span aria-hidden="true">📖</span> My Collection
      </button>
      <DraftsDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onLoadPoem={onOpenPoem}
        passages={passages}
        onRenamed={onRenamed}
      />
    </>
  );
}
