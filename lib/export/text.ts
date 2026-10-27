/**
 * Plain-text export of a finished poem. The poem is the retained words in source order, broken
 * into lines where the writer asked for a break. Line breaks never reorder words.
 */
import type { Attribution, Token } from '@/lib/models';

export interface PoemDocument {
  title: string;
  /** The poem, one string per line. */
  lines: string[];
  attribution: Attribution;
}

const UNTITLED = 'Untitled poem';

/** Puts the retained words into lines: a line ends after every word in `lineBreakSet`. */
export function poemLines(tokens: readonly Token[], lineBreakSet: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  for (const token of tokens) {
    current.push(token.text);
    if (lineBreakSet.has(token.id)) {
      lines.push(current.join(' '));
      current = [];
    }
  }
  if (current.length > 0) lines.push(current.join(' '));
  return lines;
}

/** One line, however the title was typed. */
const cleanTitle = (title: string) => title.replace(/\s+/g, ' ').trim() || UNTITLED;

const sourceLine = ({ title, author, year }: Attribution) => `Found in ${title}, ${author} (${year})`;

/** Plain text: the title, the poem, and where it was found. */
export function poemToText({ title, lines, attribution }: PoemDocument): string {
  return [cleanTitle(title), '', ...lines, '', `${sourceLine(attribution)}`, `Source: ${attribution.url ? `${attribution.source}, ${attribution.url}` : attribution.source}`, ''].join('\n');
}

/** Saves a string as a file the browser downloads. Browser-only. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the download a moment to start before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
