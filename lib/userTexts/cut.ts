/**
 * Cutting a text the reader has added into excerpts. The searches are built for a few hundred words at a time,
 * so a long text is cut where the library's books are: at about 450 words, always at the end of a paragraph (or
 * of a stanza), and only inside one when it is longer than a page by itself, where it is cut at the end of a
 * sentence (or, in verse, of a line).
 */

/** The line separator the tokenizer reads as the end of a line of verse. */
export const LINE_SEPARATOR = '\u2028';

export type TextForm = 'prose' | 'verse';

const TARGET = 450;
const MAX = 650;
const MIN_TAIL = 200;
/** A short last excerpt is joined to the one before it if they stay within this. */
const JOINED_MAX = 800;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** A text as plain lines: one kind of line end, no byte order mark, no line or paragraph separators of its own. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?|\r/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The paragraphs (or stanzas) of a text. Blank lines separate them; a text with none at all has a paragraph to a
 * line. In prose a paragraph's lines are run together; in verse they are kept, joined by the line separator.
 */
export function paragraphsOf(text: string, form: TextForm): string[] {
  const normal = normalizeText(text);
  if (normal === '') return [];
  const hasBlankLines = /\n[ \t]*\n/.test(normal);
  const blocks = hasBlankLines ? normal.split(/\n[ \t]*\n/) : form === 'verse' ? [normal] : normal.split('\n');
  return blocks
    .map(block => {
      const lines = block.split('\n').map(line => line.trim().replace(/[ \t]+/g, ' ')).filter(Boolean);
      return form === 'verse' ? lines.join(LINE_SEPARATOR) : lines.join(' ');
    })
    .filter(block => block !== '');
}

/** Pieces of about TARGET words from a list of parts (sentences or lines), never more than MAX unless one part is. */
function packParts(parts: string[], glue: string): string[] {
  const pieces: string[] = [];
  let current: string[] = [];
  let count = 0;
  const flush = () => {
    if (current.length > 0) pieces.push(current.join(glue));
    current = [];
    count = 0;
  };
  for (const part of parts) {
    const words = wordCount(part);
    if (current.length > 0 && count + words > MAX) flush();
    current.push(part);
    count += words;
    if (count >= TARGET) flush();
  }
  flush();
  return pieces;
}

/** A word-by-word cut of something with no sentence end or line end to cut at. */
function cutByWords(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const pieces: string[] = [];
  for (let start = 0; start < words.length; start += TARGET) pieces.push(words.slice(start, start + TARGET).join(' '));
  return pieces;
}

/** One paragraph (or stanza) as a unit of the cut: whole if it fits in an excerpt, otherwise in pieces. */
function unitsOf(paragraph: string, form: TextForm): string[] {
  if (wordCount(paragraph) <= MAX) return [paragraph];
  if (form === 'verse') {
    return packParts(paragraph.split(LINE_SEPARATOR), LINE_SEPARATOR).flatMap(piece => (wordCount(piece) > MAX ? cutByWords(piece) : [piece]));
  }
  const sentences = paragraph.split(/(?<=[.!?…]["'”’)\]]*)\s+/);
  return packParts(sentences, ' ').flatMap(piece => (wordCount(piece) > MAX ? cutByWords(piece) : [piece]));
}

/** The excerpts of a text: each is paragraphs separated by a blank line, as the tokenizer reads them. */
export function cutUserText(text: string, form: TextForm): string[] {
  const units = paragraphsOf(text, form).flatMap(paragraph => unitsOf(paragraph, form));
  const excerpts: { units: string[]; count: number }[] = [];
  let current = { units: [] as string[], count: 0 };
  const flush = () => {
    if (current.units.length > 0) excerpts.push(current);
    current = { units: [], count: 0 };
  };
  for (const unit of units) {
    const words = wordCount(unit);
    if (current.units.length > 0 && current.count + words > MAX) flush();
    current.units.push(unit);
    current.count += words;
    if (current.count >= TARGET) flush();
  }
  flush();

  const last = excerpts[excerpts.length - 1];
  const before = excerpts[excerpts.length - 2];
  if (last && before && last.count < MIN_TAIL && before.count + last.count <= JOINED_MAX) {
    before.units.push(...last.units);
    before.count += last.count;
    excerpts.pop();
  }
  return excerpts.map(excerpt => excerpt.units.join('\n\n'));
}

/** How many words a text has, for telling the reader. */
export const countWords = wordCount;
