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

const STYLES: readonly ErasureStyle[] = ['blackout', 'faded', 'whiteout'];
const isDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** A summary from untrusted data (a server's answer), or null if it is not exactly one. */
export function parsePoemSummary(raw: unknown): PoemSummary | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '' || typeof r.passageId !== 'string' || r.passageId === '') return null;
  if (!isCount(r.revision) || r.revision < 1 || !isCount(r.wordCount)) return null;
  if (!STYLES.includes(r.erasureStyle as ErasureStyle) || !isDate(r.createdAt) || !isDate(r.updatedAt)) return null;
  if (r.title !== undefined && typeof r.title !== 'string') return null;
  if (r.passageVersion !== undefined && typeof r.passageVersion !== 'string') return null;
  const preview = r.preview as { lines?: unknown; more?: unknown } | null;
  if (typeof preview !== 'object' || preview === null || typeof preview.more !== 'boolean' || !Array.isArray(preview.lines)) return null;
  if (!preview.lines.every(line => Array.isArray(line) && line.every(id => typeof id === 'string'))) return null;

  const summary: PoemSummary = {
    id: r.id,
    passageId: r.passageId,
    revision: r.revision,
    erasureStyle: r.erasureStyle as ErasureStyle,
    wordCount: r.wordCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    preview: { lines: preview.lines as string[][], more: preview.more },
  };
  if (r.title !== undefined) summary.title = r.title as string;
  if (r.passageVersion !== undefined) summary.passageVersion = r.passageVersion as string;
  return summary;
}
