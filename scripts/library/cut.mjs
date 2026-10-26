// Turns a Project Gutenberg plain text file into excerpts to make poems from. Plain JavaScript with no
// imports, so that the import script runs on any Node that runs the app, and the tests can use it too.
//
// The rules are deterministic: the same file always gives the same excerpts, word for word. They are also
// frozen once a book is imported (a saved poem points at the words of an excerpt by position), so a change
// to the rules must raise CUTTER_VERSION and must never be applied to books already imported.

// Version 2 adds the rules for verse (a book listed with form "verse"). Prose is cut exactly as in version 1: the
// tests pin the output for real books, and books imported with version 1 stay as they are.
export const CUTTER_VERSION = 2;
/** What separates the lines of a stanza in the text of a verse excerpt (the tokenizer shows each line on its own). */
export const LINE_SEPARATOR = '\u2028';
/** An excerpt ends at the first paragraph break after this many words ... */
export const TARGET_WORDS = 450;
/** ... or earlier, if the next paragraph would take it past this many (the least an excerpt may have, before it is joined to a long paragraph, is MIN_TAIL_WORDS). */
export const MAX_WORDS = 650;
/** A short end of a section is joined to the excerpt before it. */
export const MIN_TAIL_WORDS = 200;
/** Chapter headings that follow one another with no text between them, this many or more, are a contents list. */
export const CONTENTS_RUN = 4;
/** At least this many chapter headings must be found for the book to be cut by chapter. */
export const MIN_HEADINGS = 3;

export class CutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CutError';
  }
}

const START = /^\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*$/m;
const END = /^\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*$/m;

export const wordCount = text => (text.trim() === '' ? 0 : text.trim().split(/\s+/).length);

/** The text of the book itself: after Gutenberg's start line and before its end line, with plain newlines. */
export function stripGutenberg(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const start = START.exec(text);
  const end = END.exec(text);
  if (!start) throw new CutError('The "*** START OF THE PROJECT GUTENBERG EBOOK" line was not found, so the start of the book cannot be told from Gutenberg’s own text.');
  if (!end) throw new CutError('The "*** END OF THE PROJECT GUTENBERG EBOOK" line was not found, so the end of the book cannot be told from Gutenberg’s own text.');
  if (end.index < start.index) throw new CutError('The end line comes before the start line.');
  return text.slice(start.index + start[0].length, end.index);
}

/** What Gutenberg's header says the title and author are (from the part before the start line). */
export function headerFacts(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const start = START.exec(text);
  const head = start ? text.slice(0, start.index) : text.slice(0, 4000);
  const field = name => {
    const match = new RegExp(`^${name}:[ \\t]*(.+(?:\\n[ \\t]+\\S.*)*)`, 'mi').exec(head);
    return match ? match[1].replace(/\s+/g, ' ').trim() : '';
  };
  return { title: field('Title'), author: field('Author') };
}

const wordsOf = text =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Whether the file is the book the list says it is: every significant word of the listed title is in the
 * header's title, and the listed author's last name is in the header's author. A file for the wrong
 * number, or a different edition under another name, is reported instead of imported.
 */
export function checkHeader(raw, entry) {
  const facts = headerFacts(raw);
  const problems = [];
  const titleWords = new Set(wordsOf(facts.title));
  const wanted = wordsOf(entry.title).filter(w => !['the', 'a', 'an'].includes(w));
  const missing = wanted.filter(w => !titleWords.has(w));
  if (!facts.title) problems.push('the file has no "Title:" line');
  else if (missing.length > 0) problems.push(`the file’s title is “${facts.title}”, which does not match “${entry.title}”`);
  const lastName = wordsOf(entry.author).at(-1);
  if (!facts.author) problems.push('the file has no "Author:" line');
  else if (!wordsOf(facts.author).includes(lastName)) problems.push(`the file’s author is “${facts.author}”, which does not match “${entry.author}”`);
  return { ok: problems.length === 0, problems, facts };
}

const ROMAN = /^[IVXLCDM]+\.?$/;
const LABELLED = /^(?:CHAPTER|Chapter|BOOK|Book|PART|Part|VOLUME|Volume|LETTER|Letter|STAVE|Stave|ACT|Act|SECTION|Section)\s+(?:[IVXLCDM]+|\d+|[A-Z][A-Za-z]+)\b(?:[.:—–-].*|\s.*)?$/;
/** A contents list may give a chapter's whole summary on its line, so a long line is a heading too if it starts "CHAPTER", a number and a full stop. */
const LONG_LABELLED = /^(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+|THE LAST|The Last)\.\s/;
/** A roman number, a full stop and a title: "I. A SCANDAL IN BOHEMIA". */
const TITLED = /^[IVXLCDM]+\.\s+[A-Z][^.!?]{2,70}$/;
/** Front matter that Gutenberg's volunteers put at the start of the text. */
const CREDITS = /^(?:Produced by|Transcribed|Transcriber|E-text prepared by|Updated editions|Character set encoding|Language:|Release date|Credits:)/i;
const NOT_TEXT = /^\[(?:Illustration|Footnote|Sidenote|Transcriber|Frontispiece|Note)/i;
const ORNAMENT = /^[*\s.\-–—_=~#•]+$/;

/** In verse, a line in capitals with no sentence in it, on a line of its own, is the title of a poem ("THE RAVEN"). */
function isTitleLine(paragraph) {
  const letters = paragraph.replace(/[^A-Za-z]/g, '');
  return paragraph.length <= 70 && letters.length >= 3 && !/[,;:]$/.test(paragraph) && !ROMAN.test(paragraph) && upperShare(paragraph) >= 0.9;
}

/**
 * Whether a paragraph is a heading. A "strong" heading names itself ("Chapter IV", "XII. THE COPPER BEECHES");
 * a "weak" one is only a number on a line, which may as well number the parts of a story.
 */
function headingKind(paragraph, verse = false) {
  if (verse && paragraph.includes(LINE_SEPARATOR)) return null; // a stanza is not a heading
  if (verse && (/^(?:CANTO|Canto)\s+(?:[IVXLCDM]+|\d+)\b/.test(paragraph) || isTitleLine(paragraph))) return 'strong';
  if (paragraph.length > 80) return paragraph.length <= 220 && LONG_LABELLED.test(paragraph) ? 'strong' : null;
  if (LABELLED.test(paragraph) || TITLED.test(paragraph)) return 'strong';
  if (ROMAN.test(paragraph) || /^\d{1,3}\.?$/.test(paragraph)) return 'weak';
  return null;
}

const upperShare = text => {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters === '' ? 0 : letters.replace(/[^A-Z]/g, '').length / letters.length;
};
/** "CHAPTER IV" becomes "Chapter IV" (a roman number after a label stays in capitals), and a title mostly in capitals is set in ordinary case. */
function display(text) {
  const clean = describe(text.replace(/^\[/, '').replace(/[.:\]\s]+$/, ''), 90);
  if (ROMAN.test(clean) || upperShare(clean) < 0.7) return clean;
  return clean
    .toLowerCase()
    .replace(/(^|[\s(—–-])([a-z])/g, (_, before, letter) => before + letter.toUpperCase())
    .replace(/^([ivxlcdm]+)\./i, (_, number) => `${number.toUpperCase()}.`)
    .replace(/^(Chapter|Book|Part|Volume|Letter|Stave|Act|Section|Canto) ([ivxlcdm]+)\b/i, (_, label, number) => `${label} ${number.toUpperCase()}`);
}

/**
 * The paragraphs of the book: blank-line separated, each on one line, with italics marks and non-text removed.
 * In verse (`verse: true`) a paragraph is a stanza, and its lines stay separate, joined with LINE_SEPARATOR.
 */
export function paragraphsOf(body, { verse = false } = {}) {
  const out = [];
  for (const block of body.split(/\n[ \t]*\n/)) {
    const lines = block
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const text = verse
      ? lines.map(line => line.replace(/_([^_]+)_/g, '$1').replace(/\s+/g, ' ')).join(LINE_SEPARATOR)
      : lines.join(' ').replace(/_([^_]+)_/g, '$1').replace(/\s+/g, ' ').trim();
    const flat = text.replaceAll(LINE_SEPARATOR, ' ');
    if (!text || ORNAMENT.test(flat) || NOT_TEXT.test(flat)) continue;
    out.push(text);
  }
  // Credits come in the first few paragraphs, after Gutenberg's start line.
  let skipped = 0;
  while (skipped < out.length && skipped < 6 && CREDITS.test(out[skipped])) skipped++;
  return out.slice(skipped);
}

/** What names a chapter in its heading, to tell a line of a contents list from the heading it points at: "CHAPTER VII" in "CHAPTER VII. Laying for Him.—Locked in the Cabin". */
const headingKey = paragraph => paragraph.toUpperCase().match(/^[A-Z]+\s+(?:THE\s+)?[A-Z0-9]+/)?.[0] ?? paragraph.toUpperCase();

/** A chapter heading may be followed by a short title of the chapter, which is not a sentence. */
const isSubtitle = text => text.length <= 70 && !/[.!?"”,;:]$/.test(text) && !text.startsWith('(') && headingKind(text) === null;

/**
 * Splits the paragraphs into sections at chapter headings. A section is { label, paragraphs }.
 * Strong headings are used if there are enough of them; otherwise a bare number on a line counts too.
 * A contents list (CONTENTS_RUN or more headings with no text between them) is left out, with the front
 * matter that follows it, and so is anything before the first chapter.
 */
export function sectionsOf(paragraphs, { verse = false } = {}) {
  const kinds = paragraphs.map(paragraph => headingKind(paragraph, verse));
  const useWeak = kinds.filter(kind => kind === 'strong').length < MIN_HEADINGS;
  const sections = [{ label: null, key: null, paragraphs: [] }];
  for (let i = 0; i < paragraphs.length; i++) {
    const kind = kinds[i];
    if (kind === 'strong' || (kind === 'weak' && useWeak)) {
      let label = display(paragraphs[i]);
      const key = headingKey(paragraphs[i]);
      const next = paragraphs[i + 1];
      if (!verse && !TITLED.test(paragraphs[i]) && next !== undefined && isSubtitle(next) && paragraphs[i + 2] !== undefined) {
        label = `${label} — ${display(next)}`;
        i++;
      }
      sections.push({ label, key, paragraphs: [] });
    } else if (kind === 'weak') {
      continue; // a number that only numbers the parts of a story: not a chapter, and not a word to make a poem from
    } else {
      sections[sections.length - 1].paragraphs.push(paragraphs[i]);
    }
  }

  // A run of headings with nothing between them is a contents list. The section at the end of the run is
  // the last line of the list plus whatever comes before the book, unless it is a real chapter, which is
  // known by its heading not coming again later.
  const contents = new Set();
  for (let i = 1; i < sections.length; ) {
    let j = i;
    while (j < sections.length - 1 && sections[j].paragraphs.length === 0) j++;
    if (j - i + 1 >= CONTENTS_RUN) {
      for (let k = i; k < j; k++) contents.add(sections[k]);
      if (sections.slice(j + 1).some(later => later.key === sections[j].key)) contents.add(sections[j]);
    }
    i = j + 1;
  }
  const chapters = sections.filter(section => section.label !== null && !contents.has(section) && section.paragraphs.length > 0);
  if (chapters.length >= MIN_HEADINGS) return chapters;
  return [{ label: null, paragraphs }]; // no usable chapters: the book is cut as one run of text
}

/** A paragraph longer than MAX_WORDS, in pieces at sentence ends (or, for a sentence that is itself too long, at words). */
function splitLong(paragraph) {
  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+["”’')\]]*)?\s*/g) ?? [paragraph];
  const pieces = [];
  let current = [];
  let count = 0;
  const flush = () => {
    if (current.length > 0) pieces.push(current.join('').trim());
    current = [];
    count = 0;
  };
  for (const sentence of sentences) {
    const n = wordCount(sentence);
    if (n > MAX_WORDS) {
      flush();
      const words = sentence.trim().split(/\s+/);
      for (let i = 0; i < words.length; i += TARGET_WORDS) pieces.push(words.slice(i, i + TARGET_WORDS).join(' '));
      continue;
    }
    if (count > 0 && count + n > TARGET_WORDS) flush();
    current.push(sentence);
    count += n;
  }
  flush();
  return pieces;
}

/** A very long run of verse lines with no blank line in it, in pieces of about TARGET_WORDS that end at the end of a line. */
function splitVerse(block) {
  const pieces = [];
  let current = [];
  let count = 0;
  const flush = () => {
    if (current.length > 0) pieces.push(current.join(LINE_SEPARATOR));
    current = [];
    count = 0;
  };
  for (const line of block.split(LINE_SEPARATOR)) {
    const n = wordCount(line);
    if (current.length > 0 && count + n > TARGET_WORDS) flush();
    current.push(line);
    count += n;
  }
  flush();
  return pieces;
}

/** One section's paragraphs, grouped into excerpts of about TARGET_WORDS, each ending at a paragraph end. */
export function windowsOf(paragraphs, { verse = false } = {}) {
  const pieces = paragraphs.flatMap(p => (wordCount(p) > MAX_WORDS ? (verse ? splitVerse(p) : splitLong(p)) : [p]));
  const windows = [];
  let current = [];
  let count = 0;
  const flush = () => {
    if (current.length > 0) windows.push({ paragraphs: current, words: count });
    current = [];
    count = 0;
  };
  for (const piece of pieces) {
    const n = wordCount(piece);
    // A scrap is not left alone before a long paragraph: it goes with it, so an excerpt can reach MAX_WORDS + MIN_TAIL_WORDS.
    if (current.length > 0 && count + n > MAX_WORDS && count >= MIN_TAIL_WORDS) flush();
    current.push(piece);
    count += n;
    if (count >= TARGET_WORDS) flush();
  }
  if (current.length > 0) {
    // A short end is joined to the excerpt before it, so that no words are lost and no excerpt is a scrap.
    if (windows.length > 0 && count < MIN_TAIL_WORDS) {
      const last = windows[windows.length - 1];
      last.paragraphs.push(...current);
      last.words += count;
    } else {
      flush();
    }
  }
  return windows;
}

const pad = n => String(n).padStart(4, '0');

/** The first words, for a list: cut at a whole word, with an ellipsis. */
export function describe(text, max = 140) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max).replace(/\s+\S*$/, '');
  return `${cut || flat.slice(0, max)}…`;
}

/**
 * Verse: a poem is whole where it can be. Short poems are packed one after another into an excerpt of about
 * TARGET_WORDS (named for the poems in it, and with each poem's title in the text so that the reader sees where one
 * ends); a poem too long for one excerpt is cut at stanza and line ends, and is named "Title (2 of 3)".
 */
function verseExcerpts(sections) {
  const units = [];
  let pack = { titles: [], blocks: [], words: 0 };
  const flush = () => {
    if (pack.blocks.length > 0) units.push(pack);
    pack = { titles: [], blocks: [], words: 0 };
  };
  for (const section of sections) {
    const words = wordCount(section.paragraphs.join(' '));
    if (section.label !== null && words > MAX_WORDS) {
      flush();
      const windows = windowsOf(section.paragraphs, { verse: true });
      windows.forEach((window, index) => units.push({ titles: [windows.length > 1 ? `${section.label} (${index + 1} of ${windows.length})` : section.label], blocks: window.paragraphs, words: window.words }));
      continue;
    }
    if (pack.words > 0 && pack.words + words > MAX_WORDS) flush();
    pack.titles.push(section.label);
    // With more than one poem in an excerpt, each keeps its title in the text; a poem alone is named by the excerpt.
    pack.blocks.push({ title: section.label, paragraphs: section.paragraphs });
    pack.words += words;
    if (pack.words >= TARGET_WORDS) flush();
  }
  flush();
  // A short last pack is joined to the one before it.
  const last = units[units.length - 1];
  const before = units[units.length - 2];
  if (last && before && last.words < MIN_TAIL_WORDS && last.blocks[0]?.paragraphs !== undefined && before.blocks[0]?.paragraphs !== undefined && before.words + last.words <= MAX_WORDS + MIN_TAIL_WORDS) {
    before.titles.push(...last.titles);
    before.blocks.push(...last.blocks);
    before.words += last.words;
    units.pop();
  }
  return units.map(unit => {
    const poems = unit.blocks.length > 0 && unit.blocks[0].paragraphs !== undefined;
    const text = poems
      ? unit.blocks.length === 1
        ? unit.blocks[0].paragraphs.join('\n\n')
        : unit.blocks.flatMap(poem => [poem.title, ...poem.paragraphs]).join('\n\n')
      : unit.blocks.join('\n\n');
    const label = unit.titles.length === 1 ? unit.titles[0] : describe(unit.titles.join(' · '), 90);
    return { label, sourceText: text };
  });
}

/**
 * The excerpts of a book. `entry` is { gutenbergId, title, author, year, form }, with form "verse" for poetry (the
 * default is prose). Each excerpt is { id, ordinal, title, description, sourceText, wordCount }; the id is
 * "pg<number>-<ordinal, 4 digits>".
 */
export function cutBook(raw, entry) {
  const verse = entry.form === 'verse';
  const sections = sectionsOf(paragraphsOf(stripGutenberg(raw), { verse }), { verse });
  const excerpts = [];
  const add = (label, sourceText) => {
    const ordinal = excerpts.length + 1;
    excerpts.push({
      id: `pg${entry.gutenbergId}-${pad(ordinal)}`,
      ordinal,
      title: `${entry.title} — ${label ?? `Part ${ordinal}`}`,
      description: describe(sourceText),
      sourceText,
      wordCount: wordCount(sourceText),
    });
  };
  if (verse && sections[0].label !== null) {
    for (const unit of verseExcerpts(sections)) add(unit.label, unit.sourceText);
  } else {
    for (const section of sections) {
      const windows = windowsOf(section.paragraphs, { verse });
      windows.forEach((window, index) => {
        const part = section.label === null ? null : windows.length > 1 ? `${section.label} (${index + 1} of ${windows.length})` : section.label;
        add(part, window.paragraphs.join('\n\n'));
      });
    }
  }
  if (excerpts.length === 0) throw new CutError('No text was left after the cutting, so there is nothing to make an excerpt from.');
  return excerpts;
}
