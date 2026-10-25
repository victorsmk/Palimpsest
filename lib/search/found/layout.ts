import type { PageDnaBlock } from './types';

export interface PlacedBlock {
  block: PageDnaBlock;
  /** Row on the strip, from 0. Blocks that overlap along the passage get different rows. */
  row: number;
  /** Where the block is drawn, as fractions of the strip: 0 is the start, 1 the end. */
  start: number;
  end: number;
}

/**
 * Places the strip's blocks in rows so that no two blocks in a row overlap. Poems to find can
 * overlap by up to half (that is how families are formed), so a strip drawn in one row would
 * merge them into a darker patch and make "darker" mean two things. Greedy, in reading order:
 * each block takes the first row that is free at its start. `blocks` must be in reading order,
 * as `analyzeFound` returns them.
 *
 * `minFraction` is the narrowest a block may be drawn, as a fraction of the strip. A strip on a
 * phone is only a few hundred pixels wide, so a short poem would be a sliver too small to touch;
 * widening it to a minimum keeps it usable, and rows are worked out from the widened blocks so
 * nothing overlaps. A widened block keeps its start (shifted left only if it would run off the end).
 */
export function layoutPageDnaBlocks(
  blocks: PageDnaBlock[],
  minFraction = 0
): { placed: PlacedBlock[]; rows: number } {
  const rowEnds: number[] = [];
  const placed = blocks.map(block => {
    const width = Math.min(1, Math.max(block.endFraction - block.startFraction, minFraction));
    const start = Math.min(block.startFraction, 1 - width);
    const end = start + width;

    let row = rowEnds.findIndex(rowEnd => rowEnd <= start);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = end;
    return { block, row, start, end };
  });
  return { placed, rows: Math.max(1, rowEnds.length) };
}
