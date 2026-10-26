import type { ErasureStyle, Poem } from './index';

/** How many lines of a poem its preview shows. */
export const PREVIEW_LINES = 3;

/**
 * How many words of one line the preview keeps. A line is shown cut at 60 characters, and 31 words
 * are at least 61 characters (a word is one character at the least, and there is a space between
 * words), so more than this could never be shown.
 */
export const PREVIEW_WORDS_PER_LINE = 31;

/**
 * The start of a poem, as the words' ids: its first lines as the writer broke them, each cut to the
 * words that could be shown, and whether there is more after them. It is made from the poem alone,
 * so a server can make it without knowing the passage; a screen turns it into text with the passage.
 */
export interface PoemPreviewHead {
  lines: string[][];
  more: boolean;
}

/**
 * A poem without its words: all a list of poems needs, small however long the poem is. The words
 * (`retainedTokenIds`, `lineBreaks`) and the notes come only with the whole poem, when it is opened.
 */
export interface PoemSummary {
  id: string;
  passageId: string;
  passageVersion?: string;
  revision: number;
  title?: string;
  erasureStyle: ErasureStyle;
  /** How many words the poem keeps. */
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  preview: PoemPreviewHead;
}

/** The first lines of a poem (see PoemPreviewHead). */
export function previewHeadOf(poem: Pick<Poem, 'retainedTokenIds' | 'lineBreaks'>): PoemPreviewHead {
  const breaks = new Set(poem.lineBreaks);
  const ids = poem.retainedTokenIds;
  const lines: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (current.length < PREVIEW_WORDS_PER_LINE) current.push(ids[i]);
    if (breaks.has(ids[i])) {
      lines.push(current);
      current = [];
      if (lines.length === PREVIEW_LINES) return { lines, more: i < ids.length - 1 };
    }
  }
  if (current.length > 0) lines.push(current);
  return { lines, more: false };
}

/** A poem's summary. */
export function summarizePoem(poem: Poem): PoemSummary {
  const summary: PoemSummary = {
    id: poem.id,
    passageId: poem.passageId,
    revision: poem.revision,
    erasureStyle: poem.erasureStyle,
    wordCount: poem.retainedTokenIds.length,
    createdAt: poem.createdAt,
    updatedAt: poem.updatedAt,
    preview: previewHeadOf(poem),
  };
  if (poem.passageVersion) summary.passageVersion = poem.passageVersion;
  if (poem.title !== undefined) summary.title = poem.title;
  return summary;
}
