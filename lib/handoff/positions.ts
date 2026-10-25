/**
 * The way links name kept words: by position, as the numbers inside token IDs
 * (`walden-woods-token-0014` is position 14). Shared by every link that lists words.
 */

/** One word ("14") or a run of consecutive words ("14-17"), as a piece of a regular expression. */
export const PART = '\\d{1,6}(?:-\\d{1,6})?';

/** The list of kept words, up to `max` pieces, as a piece of a regular expression. */
export const keptPattern = (max: number) => `${PART}(?:,${PART}){0,${max - 1}}`;

/** The list of break positions (possibly empty), up to `max`, as a piece of a regular expression. */
export const breaksPattern = (max: number) => `(?:\\d{1,6}(?:,\\d{1,6}){0,${max - 1}})?`;

/** Runs of three or more consecutive positions are written first-last, anything shorter one by one. */
export function writeKept(positions: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < positions.length; ) {
    let j = i;
    while (j + 1 < positions.length && positions[j + 1] === positions[j] + 1) j++;
    if (j - i >= 2) parts.push(`${positions[i]}-${positions[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(positions[k]));
    i = j + 1;
  }
  return parts.join(',');
}

/**
 * Reads a written list of kept words back into positions. Null unless the positions are strictly
 * ascending (no repeats, no overlap), no run runs backwards, and there are no more than `max` of them.
 * A huge run is refused before it is expanded.
 */
export function readKept(spec: string, max: number): number[] | null {
  const positions: number[] = [];
  for (const part of spec.split(',')) {
    const [from, to = from] = part.split('-').map(Number);
    if (to < from) return null;
    if (positions.length + (to - from + 1) > max) return null;
    for (let position = from; position <= to; position++) {
      if (positions.length > 0 && position <= positions[positions.length - 1]) return null;
      positions.push(position);
    }
  }
  return positions;
}

/**
 * Reads a written list of line breaks. Null unless the positions are strictly ascending, each is one
 * of the kept words, and none is the last (a break follows a word of the poem, not its end).
 */
export function readBreaks(spec: string, kept: number[]): number[] | null {
  const breaks = spec ? spec.split(',').map(Number) : [];
  const last = kept[kept.length - 1];
  const keptSet = new Set(kept);
  for (let i = 0; i < breaks.length; i++) {
    const ascending = i === 0 || breaks[i] > breaks[i - 1];
    if (!ascending || !keptSet.has(breaks[i]) || breaks[i] === last) return null;
  }
  return breaks;
}
