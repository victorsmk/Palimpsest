import type { Passage, PoemPreviewHead } from '@/lib/models';

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
 * The start of a saved poem, for a list: its first lines in words, taken from the passage's own text.
 * `head` is the poem's preview (see PoemSummary), which holds the ids of the words of the first lines
 * and no more than can be shown within 60 characters a line. Null when the poem cannot be shown
 * faithfully: its passage is not in the library, or one of those words is not in the passage.
 */
export function poemPreview(head: PoemPreviewHead, passage: Pick<Passage, 'tokens'> | undefined, maxChars = 60): PoemPreview | null {
  if (!passage) return null;
  const byId = new Map(passage.tokens.map(token => [token.id, token]));
  const lines: string[] = [];
  for (const ids of head.lines) {
    const words = ids.map(id => byId.get(id));
    if (words.some(word => word === undefined)) return null;
    lines.push(clip(words.map(word => word!.text).join(' '), maxChars));
  }
  return { lines, more: head.more };
}
