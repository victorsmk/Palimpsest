import type { Passage, Poem } from '@/lib/models';
import { poemLines } from './text';

const UNTITLED = 'Untitled poem';
const DIVIDER = '----------------------------------------';

/** One line, however the title was typed. */
const cleanTitle = (title: string | undefined) => (title ?? '').replace(/\s+/g, ' ').trim() || UNTITLED;

/** "palimpsest-poems-2026-10-28.txt", with the date as it is where the writer is. */
export function collectionTextFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `palimpsest-poems-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`;
}

export interface CollectionText {
  text: string;
  /** Poems written into the text. */
  written: number;
  /** Poems left out because the text they came from could not be found, or no longer has their words. */
  skipped: number;
}

/**
 * The poem as a reader would want it: its title, its lines, where it was found, and the writer's notes.
 * Null when it cannot be written faithfully: the passage is not there, or one of the poem's words is not in it.
 */
function poemBlock(poem: Poem, passage: Passage | undefined): string | null {
  if (!passage) return null;
  const retained = new Set(poem.retainedTokenIds);
  const tokens = passage.tokens.filter(token => token.isSelectable && retained.has(token.id));
  if (tokens.length !== retained.size) return null;
  const { title, author, year } = passage.attribution;
  const block = [cleanTitle(poem.title), '', ...poemLines(tokens, new Set(poem.lineBreaks)), '', `Found in ${title}, ${author} (${year})`];
  const notes = poem.notes?.trim();
  if (notes) block.push('', 'Notes:', notes);
  return block.join('\n');
}

/**
 * All of a collection's poems as one plain text file that anyone can open: a short heading, then each
 * poem, most recently changed first (the order of the collection), with a line between them. The words
 * are the poem's own, taken from the text each was found in, in the order of that text.
 */
export function collectionToText(poems: readonly Poem[], passages: ReadonlyMap<string, Passage>, now: Date = new Date()): CollectionText {
  const blocks: string[] = [];
  let skipped = 0;
  for (const poem of poems) {
    const block = poemBlock(poem, passages.get(poem.passageId));
    if (block === null) skipped++;
    else blocks.push(block);
  }
  const heading = [`My poems from Palimpsest`, `${blocks.length} ${blocks.length === 1 ? 'poem' : 'poems'}, downloaded ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`];
  const parts = [heading.join('\n'), ...blocks];
  if (skipped > 0) {
    parts.push(`${skipped} ${skipped === 1 ? 'poem was' : 'poems were'} left out because the text ${skipped === 1 ? 'it was' : 'they were'} found in could not be opened.`);
  }
  return { text: parts.join(`\n\n${DIVIDER}\n\n`) + '\n', written: blocks.length, skipped };
}
