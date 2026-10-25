import type { Passage, Poem } from '@/lib/models';
import { poemLines } from '@/lib/export/text';

export interface PoemPreview {
  /** The first lines of the poem, as the writer broke them. A long line is cut short and ends in "…". */
  lines: string[];
  /** True when the poem has more lines than are shown. */
  more: boolean;
}

/** A line cut at the last whole word that fits, with an ellipsis. */
function clip(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line;
  const cut = line.slice(0, maxChars);
  const atWord = cut.replace(/\s+\S*$/, '');
  return `${atWord || cut}…`;
}

/**
 * The start of a saved poem, for a list: its first few lines, taken from the passage's own words.
 * Null when the poem cannot be shown faithfully: its passage is not in the library, or one of its
 * words is not in the passage.
 */
export function poemPreview(
  poem: Pick<Poem, 'retainedTokenIds' | 'lineBreaks'>,
  passage: Pick<Passage, 'tokens'> | undefined,
  maxLines = 3,
  maxChars = 60
): PoemPreview | null {
  if (!passage) return null;
  const byId = new Map(passage.tokens.map(token => [token.id, token]));
  const words = poem.retainedTokenIds.map(id => byId.get(id));
  if (words.some(word => word === undefined)) return null;

  const lines = poemLines(words as NonNullable<(typeof words)[number]>[], new Set(poem.lineBreaks));
  return { lines: lines.slice(0, maxLines).map(line => clip(line, maxChars)), more: lines.length > maxLines };
}
