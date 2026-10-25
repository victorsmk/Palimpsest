import type { PageDnaBlock } from './types';

export interface PlacedBlock {
  block: PageDnaBlock;
  /** Row on the strip, from 0. Blocks that overlap along the passage get different rows. */
  row: number;
}

/**
 * Places the strip's blocks in rows so that no two blocks in a row overlap. Poems to find can
 * overlap by up to half (that is how families are formed), so a strip drawn in one row would
 * merge them into a darker patch and make "darker" mean two things. Greedy, in reading order:
 * each block takes the first row that is free at its start. `blocks` must be in reading order,
 * as `analyzeFound` returns them.
 */
export function layoutPageDnaBlocks(blocks: PageDnaBlock[]): { placed: PlacedBlock[]; rows: number } {
  const rowEnds: number[] = [];
  const placed = blocks.map(block => {
    let row = rowEnds.findIndex(end => end <= block.startFraction);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = block.endFraction;
    return { block, row };
  });
  return { placed, rows: Math.max(1, rowEnds.length) };
}
