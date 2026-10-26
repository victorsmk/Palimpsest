import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CutError,
  MAX_WORDS,
  CONTENTS_RUN,
  MIN_TAIL_WORDS,
  TARGET_WORDS,
  checkHeader,
  cutBook,
  describe as describeText,
  headerFacts,
  paragraphsOf,
  sectionsOf,
  stripGutenberg,
  windowsOf,
  wordCount,
} from '../../scripts/library/cut.mjs';
import { tokenize } from '@/lib/tokenizer';

// Cutting a Project Gutenberg file into excerpts: the book is found inside Gutenberg's own text, chapters are
// found, and excerpts are about 450 words each, ending at a paragraph. The rules are frozen once books are
// imported, so these tests also pin them down.

/** A paragraph of exactly `n` words, each marked so that words can be followed through the cutting. */
const para = (n: number, mark = 'w') => `${Array.from({ length: n - 1 }, (_, i) => `${mark}${i}`).join(' ')} end.`;
const file = (body: string, { title = 'Test Book', author = 'Some Author' } = {}) =>
  `The Project Gutenberg eBook of ${title}\n\nTitle: ${title}\n\nAuthor: ${author}\n\nRelease date: January 1, 2000\n\n*** START OF THE PROJECT GUTENBERG EBOOK ${title.toUpperCase()} ***\n\n${body}\n\n*** END OF THE PROJECT GUTENBERG EBOOK ${title.toUpperCase()} ***\n\nThe licence, in full.\n`;
const entry = { gutenbergId: 7, title: 'Test Book', author: 'Some Author', year: 1900 };

describe('finding the book inside Gutenberg’s file', () => {
  it('takes what is between the start and end lines, and none of Gutenberg’s own words', () => {
    const body = stripGutenberg(file('Hello there.\n\nSecond paragraph.'));
    expect(body.trim()).toBe('Hello there.\n\nSecond paragraph.');
    expect(body).not.toMatch(/Gutenberg|licence|Release date/i);
  });

  it('accepts both wordings of the start and end lines, with or without the space after the stars', () => {
    expect(stripGutenberg('x\n*** START OF THIS PROJECT GUTENBERG EBOOK B ***\nbody\n*** END OF THIS PROJECT GUTENBERG EBOOK B ***\ny').trim()).toBe('body');
    expect(stripGutenberg('x\n***START OF THE PROJECT GUTENBERG EBOOK B***\nbody\n***END OF THE PROJECT GUTENBERG EBOOK B***\ny').trim()).toBe('body');
  });

  it('copes with Windows line ends and a byte order mark', () => {
    const body = stripGutenberg('﻿' + file('One.\n\nTwo.').replace(/\n/g, '\r\n'));
    expect(body).not.toContain('\r');
    expect(body.trim()).toBe('One.\n\nTwo.');
  });

  it('says so, and cuts nothing, when a line is missing or in the wrong order', () => {
    expect(() => stripGutenberg('just a text')).toThrow(CutError);
    expect(() => stripGutenberg('*** START OF THE PROJECT GUTENBERG EBOOK X ***\nbody')).toThrow(/END OF/);
    expect(() => stripGutenberg('body\n*** END OF THE PROJECT GUTENBERG EBOOK X ***')).toThrow(/START OF/);
    expect(() => stripGutenberg('*** END OF THE PROJECT GUTENBERG EBOOK X ***\n*** START OF THE PROJECT GUTENBERG EBOOK X ***')).toThrow(/before/);
  });
});

describe('checking that a file is the book that was listed', () => {
  it('reads the title and the author, which may run over two lines', () => {
    const raw = file('x', { title: 'A Long Title:\n  Or, The Whole Thing' });
    expect(headerFacts(raw).title).toBe('A Long Title: Or, The Whole Thing');
    expect(headerFacts(raw).author).toBe('Some Author');
  });

  it('accepts the book when the listed words are in the title and the last name is in the author', () => {
    const raw = file('x', { title: 'Frankenstein; Or, The Modern Prometheus', author: 'Shelley, Mary Wollstonecraft' });
    expect(checkHeader(raw, { title: 'Frankenstein', author: 'Mary Shelley' }).ok).toBe(true);
    expect(checkHeader(raw, { title: 'The Frankenstein', author: 'Mary Wollstonecraft Shelley' }).ok).toBe(true);
  });

  it('ignores accents and capitals, so Brontë matches Bronte', () => {
    const raw = file('x', { title: 'JANE EYRE: An Autobiography', author: 'Brontë, Charlotte' });
    expect(checkHeader(raw, { title: 'Jane Eyre', author: 'Charlotte Bronte' }).ok).toBe(true);
  });

  it('refuses a file of another book, or another author, and says which', () => {
    const raw = file('x', { title: 'Emma', author: 'Austen, Jane' });
    const wrongTitle = checkHeader(raw, { title: 'Persuasion', author: 'Jane Austen' });
    expect(wrongTitle.ok).toBe(false);
    expect(wrongTitle.problems[0]).toContain('does not match “Persuasion”');
    const wrongAuthor = checkHeader(raw, { title: 'Emma', author: 'Charles Dickens' });
    expect(wrongAuthor.ok).toBe(false);
    expect(wrongAuthor.problems[0]).toContain('does not match “Charles Dickens”');
  });

  it('refuses a file with no title or author line', () => {
    const bare = '*** START OF THE PROJECT GUTENBERG EBOOK X ***\nbody\n*** END OF THE PROJECT GUTENBERG EBOOK X ***';
    const result = checkHeader(bare, { title: 'X', author: 'Y' });
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(2);
  });
});

describe('the paragraphs of a book', () => {
  it('joins the lines of a paragraph, and splits at blank lines (a line of spaces is blank)', () => {
    expect(paragraphsOf('First line\nsecond line\n  \nNext one\n\n\n\nLast')).toEqual(['First line second line', 'Next one', 'Last']);
  });

  it('takes the underscores of italics away', () => {
    expect(paragraphsOf('She said _never_ and meant _it_.')).toEqual(['She said never and meant it.']);
  });

  it('leaves out illustrations, footnote marks and ornaments, and keeps everything else in brackets', () => {
    const out = paragraphsOf('[Illustration: A boat]\n\n* * * * *\n\n[Footnote 1: See page 3.]\n\n— — —\n\n[He spoke in a whisper] and left.');
    expect(out).toEqual(['[He spoke in a whisper] and left.']);
  });

  it('leaves out the volunteers’ credits at the start, but not the same words later', () => {
    const out = paragraphsOf('Produced by Some Volunteers\n\nTranscribed from a book\n\nIt begins.\n\nProduced by hand, as they say.');
    expect(out).toEqual(['It begins.', 'Produced by hand, as they say.']);
  });
});

describe('finding the chapters', () => {
  const chapter = (heading: string, words = 300, mark = 'c') => [heading, para(words, mark)];

  it('cuts by chapter when it finds at least three, and names each', () => {
    const paragraphs = [...chapter('CHAPTER I'), ...chapter('CHAPTER II'), ...chapter('CHAPTER III')];
    const sections = sectionsOf(paragraphs);
    expect(sections.map(s => s.label)).toEqual(['Chapter I', 'Chapter II', 'Chapter III']);
    expect(sections.every(s => s.paragraphs.length === 1)).toBe(true);
  });

  it('finds the headings in their usual forms', () => {
    const forms = ['Chapter 1.', 'CHAPTER IV.—THE STORM', 'Book Two', 'PART THE FIRST', 'V.', '12', 'LETTER 3', 'Stave One'];
    for (const form of forms) {
      const sections = sectionsOf([...chapter(form), ...chapter('CHAPTER II'), ...chapter('CHAPTER III')]);
      expect(sections.length, form).toBe(3);
    }
  });

  it('puts a chapter’s short title in its name, but not a sentence', () => {
    const sections = sectionsOf([...chapter('CHAPTER I'), ...[para(3, 'x')], ...chapter('CHAPTER II'), ...chapter('CHAPTER III')].flat());
    expect(sections[0].label).toBe('Chapter I');
    const withTitle = sectionsOf(['CHAPTER I', 'THE SPIRIT OF THE PLACE', para(300), 'CHAPTER II', 'A Walk', para(300), 'CHAPTER III', para(300)]);
    expect(withTitle.map(s => s.label)).toEqual(['Chapter I — The Spirit Of The Place', 'Chapter II — A Walk', 'Chapter III']);
  });

  it('writes a heading in capitals in ordinary case, keeping the roman number', () => {
    const [first] = sectionsOf(['CHAPTER XIV', para(300), 'CHAPTER XV', para(300), 'CHAPTER XVI', para(300)]);
    expect(first.label).toBe('Chapter XIV');
    const titled = sectionsOf(['CHAPTER I', 'CIVIL DISOBEDIENCE', para(300), 'CHAPTER II', para(300), 'CHAPTER III', para(300)]);
    expect(titled[0].label).toBe('Chapter I — Civil Disobedience');
  });

  it('leaves a contents list and the front matter out', () => {
    const contents = 'CHAPTER I. Beginnings CHAPTER II. Middles CHAPTER III. Ends';
    const headingsOnly = ['CHAPTER I', 'CHAPTER II', 'CHAPTER III'];
    const sections = sectionsOf(['A Title Page', 'Dedicated to a friend.', contents, ...headingsOnly, ...chapter('CHAPTER I', 300, 'a'), ...chapter('CHAPTER II', 300, 'b'), ...chapter('CHAPTER III', 300, 'c')]);
    expect(sections.map(s => s.label)).toEqual(['Chapter I', 'Chapter II', 'Chapter III']);
    expect(sections.flatMap(s => s.paragraphs).join(' ')).not.toContain('Dedicated');
  });

  it('keeps a short chapter as an excerpt of its own, and leaves out a heading with nothing under it', () => {
    const sections = sectionsOf([...chapter('CHAPTER I'), ...chapter('CHAPTER II', 12), 'CHAPTER III', ...chapter('CHAPTER IV'), ...chapter('CHAPTER V')]);
    expect(sections.map(s => s.label)).toEqual(['Chapter I', 'Chapter II', 'Chapter IV', 'Chapter V']);
    expect(wordCount(sections[1].paragraphs.join(' '))).toBe(12);
  });

  it('leaves out a contents list of any length, whose lines may be long summaries, and the front matter after it', () => {
    const lines = Array.from({ length: CONTENTS_RUN }, (_, i) => `CHAPTER ${i + 1}. A long summary of what happens.—And then something else.—And a third thing to read.—Last of all.`);
    expect(lines[0].length).toBeGreaterThan(80);
    const sections = sectionsOf(['CONTENTS.', ...lines, 'ILLUSTRATIONS.', para(300, 'front'), ...chapter('CHAPTER 1.', 300, 'a'), ...chapter('CHAPTER 2.', 300, 'b'), ...chapter('CHAPTER 3.', 300, 'c'), ...chapter('CHAPTER 4.', 300, 'd')]);
    expect(sections.map(s => s.label)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4']);
    expect(sections.flatMap(s => s.paragraphs).join(' ')).not.toContain('front0');
  });

  it('does not take a book heading above a chapter for a contents list', () => {
    const sections = sectionsOf(['BOOK THE FIRST', ...chapter('CHAPTER I'), ...chapter('CHAPTER II'), 'BOOK THE SECOND', ...chapter('CHAPTER III')]);
    expect(sections.map(s => s.label)).toEqual(['Chapter I', 'Chapter II', 'Chapter III']);
  });

  it('uses a title with a number ("I. A SCANDAL IN BOHEMIA") as a chapter, and drops the bare numbers inside as neither chapters nor words', () => {
    const paragraphs = ['I. A SCANDAL IN BOHEMIA', 'I.', para(300, 'a'), 'II.', para(300, 'b'), 'II. THE RED-HEADED LEAGUE', 'I.', para(300, 'c'), 'III. A CASE OF IDENTITY', para(300, 'd')];
    const sections = sectionsOf(paragraphs);
    expect(sections.map(s => s.label)).toEqual(['I. A Scandal In Bohemia', 'II. The Red-Headed League', 'III. A Case Of Identity']);
    expect(sections[0].paragraphs).toHaveLength(2);
    expect(sections.flatMap(s => s.paragraphs)).not.toContain('I.');
  });

  it('uses bare numbers as chapters when there is nothing better', () => {
    const sections = sectionsOf(['I.', para(300, 'a'), 'II.', para(300, 'b'), 'III.', para(300, 'c')]);
    expect(sections.map(s => s.label)).toEqual(['I', 'II', 'III']);
  });

  it('does not take a stage direction under a heading for its title', () => {
    const sections = sectionsOf(['CHAPTER 1. Aloft', '(The main-top-sail yard)', para(300, 'a'), ...chapter('CHAPTER 2. Below'), ...chapter('CHAPTER 3. Away')]);
    expect(sections[0].label).toBe('Chapter 1. Aloft'.replace('Chapter', 'CHAPTER'));
    expect(sections[0].paragraphs[0]).toBe('(The main-top-sail yard)');
  });

  it('sets titles in capitals in ordinary case without capitalising after an apostrophe, and tidies the ends', () => {
    const labelOf = (heading: string, subtitle: string) => sectionsOf([heading, subtitle, para(300, 'a'), ...chapter('CHAPTER II'), ...chapter('CHAPTER III')])[0].label;
    expect(labelOf('CHAPTER III', 'JONATHAN HARKER’S JOURNAL')).toBe('Chapter III — Jonathan Harker’s Journal');
    expect(labelOf('CHAPTER III', 'JONATHAN HARKER’S JOURNAL--continued')).toBe('Chapter III — Jonathan Harker’s Journal--Continued');
    expect(sectionsOf(['Chapter I.]', para(300), 'Chapter II', para(300), 'Chapter III', para(300)])[0].label).toBe('Chapter I');
  });

  it('keeps a long title to a sensible length', () => {
    const long = `CHAPTER 9. ${'A very long summary of everything.—'.repeat(4)}`;
    const [first] = sectionsOf([long, para(300), ...chapter('CHAPTER 10.'), ...chapter('CHAPTER 11.')]);
    const label = String(first.label);
    expect(label.length).toBeLessThanOrEqual(91);
    expect(label.endsWith('…')).toBe(true);
  });

  it('cuts the whole text as one run when there are fewer than three chapters', () => {
    const paragraphs = [para(300), 'CHAPTER I', para(300), para(300)];
    const sections = sectionsOf(paragraphs);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
    expect(sections[0].paragraphs).toEqual(paragraphs);
  });
});

describe('cutting a run of paragraphs into excerpts', () => {
  const totalWords = (windows: { paragraphs: string[] }[]) => windows.reduce((sum, w) => sum + wordCount(w.paragraphs.join(' ')), 0);

  it('ends an excerpt at the first paragraph end past the target', () => {
    const windows = windowsOf([para(200), para(200), para(200), para(200), para(200), para(200)]);
    expect(windows.map(w => w.paragraphs.length)).toEqual([3, 3]);
    expect(windows.map(w => w.words)).toEqual([600, 600]);
  });

  it('does not take the next paragraph if it would pass the most', () => {
    const windows = windowsOf([para(400), para(300), para(300)]);
    expect(windows.map(w => w.words)).toEqual([400, 600]);
  });

  it('joins a short end to the excerpt before it, so that no scrap is left', () => {
    const windows = windowsOf([para(500), para(100)]);
    expect(windows).toHaveLength(1);
    expect(windows[0].words).toBe(600);
  });

  it('keeps a tail that is long enough as an excerpt of its own', () => {
    const windows = windowsOf([para(500), para(MIN_TAIL_WORDS)]);
    expect(windows.map(w => w.words)).toEqual([500, MIN_TAIL_WORDS]);
  });

  it('keeps a text shorter than any of that as one excerpt', () => {
    expect(windowsOf([para(40)]).map(w => w.words)).toEqual([40]);
  });

  it('does not leave a scrap alone in front of a long paragraph', () => {
    const windows = windowsOf([para(60), para(MAX_WORDS - 10)]);
    expect(windows).toHaveLength(1);
    expect(windows[0].words).toBe(60 + MAX_WORDS - 10);
  });

  it('splits a paragraph longer than the most at sentence ends, and never in the middle of a sentence', () => {
    const sentence = (i: number) => `${Array.from({ length: 49 }, (_, k) => `s${i}w${k}`).join(' ')} done.`; // 50 words
    const long = Array.from({ length: 30 }, (_, i) => sentence(i)).join(' '); // 1,500 words
    const windows = windowsOf([long]);
    expect(windows.length).toBeGreaterThan(2);
    for (const w of windows) for (const p of w.paragraphs) expect(p.endsWith('done.')).toBe(true);
    expect(totalWords(windows)).toBe(1500);
  });

  it('splits a sentence that is itself longer than the most, by words', () => {
    const run = Array.from({ length: 1400 }, (_, i) => `r${i}`).join(' ');
    const windows = windowsOf([run]);
    expect(totalWords(windows)).toBe(1400);
    expect(windows.every(w => w.words <= MAX_WORDS + MIN_TAIL_WORDS)).toBe(true);
  });

  it('loses no word and changes no order: the excerpts together are the paragraphs', () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => para(30 + ((i * 37) % 400), `p${i}x`));
    const windows = windowsOf(paragraphs);
    expect(windows.flatMap(w => w.paragraphs).join(' ')).toBe(paragraphs.join(' '));
    for (const w of windows.slice(0, -1)) expect(w.words).toBeGreaterThanOrEqual(MIN_TAIL_WORDS);
    for (const w of windows) expect(w.words).toBeLessThanOrEqual(MAX_WORDS + MIN_TAIL_WORDS);
  });

  it('has the sizes the design says', () => {
    expect([TARGET_WORDS, MAX_WORDS, MIN_TAIL_WORDS, CONTENTS_RUN]).toEqual([450, 650, 200, 4]);
  });
});

describe('the excerpts of a book', () => {
  const body = ['CHAPTER I', 'The Start', para(700, 'a'), 'CHAPTER II', para(300, 'b'), 'CHAPTER III', para(300, 'c')].join('\n\n');

  it('gives each excerpt an id, an ordinal, a title, a description and its words', () => {
    const excerpts = cutBook(file(body), entry);
    expect(excerpts.map(e => e.id)).toEqual(['pg7-0001', 'pg7-0002', 'pg7-0003', 'pg7-0004']);
    expect(excerpts.map(e => e.ordinal)).toEqual([1, 2, 3, 4]);
    expect(excerpts.map(e => e.title)).toEqual([
      'Test Book — Chapter I — The Start (1 of 2)',
      'Test Book — Chapter I — The Start (2 of 2)',
      'Test Book — Chapter II',
      'Test Book — Chapter III',
    ]);
    expect(excerpts[0].description.startsWith('a0 a1 a2')).toBe(true);
    expect(excerpts[0].description.endsWith('…')).toBe(true);
    expect(excerpts[2].wordCount).toBe(300);
    expect(excerpts[0].sourceText).not.toMatch(/CHAPTER|Gutenberg/);
  });

  it('numbers a book with no chapters in parts', () => {
    const excerpts = cutBook(file([para(500), para(500), para(500)].join('\n\n')), entry);
    expect(excerpts.map(e => e.title)).toEqual(['Test Book — Part 1', 'Test Book — Part 2', 'Test Book — Part 3']);
  });

  it('gives the same excerpts every time', () => {
    const raw = file(body);
    expect(cutBook(raw, entry)).toEqual(cutBook(raw, entry));
  });

  it('says so when nothing is left', () => {
    expect(() => cutBook(file('[Illustration: only a picture]'), entry)).toThrow(/nothing to make an excerpt from/);
  });

  it('gives text the tokenizer can use: the words are the words of the excerpt', () => {
    const [first] = cutBook(file(body), entry);
    const tokens = tokenize(first.id, first.sourceText);
    expect(tokens.filter(t => t.isSelectable)).toHaveLength(first.wordCount);
    expect(tokens[0].id).toBe('pg7-0001-token-0000');
  });

  it('cuts a description at a whole word', () => {
    expect(describeText('short')).toBe('short');
    expect(describeText(`${'word '.repeat(60)}`.trim())).toMatch(/word…$/);
    expect(describeText(`${'word '.repeat(60)}`.trim()).length).toBeLessThanOrEqual(141);
  });
});

describe('three real books from Project Gutenberg', () => {
  const books = [
    { file: 'jane-eyre', entry: { gutenbergId: 1260, title: 'Jane Eyre', author: 'Charlotte Bronte', year: 1847 }, chapters: 38 },
    { file: 'dorian-gray', entry: { gutenbergId: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', year: 1890 }, chapters: 20 },
    { file: 'walden', entry: { gutenbergId: 205, title: 'Walden', author: 'Henry David Thoreau', year: 1854 }, chapters: 0 },
  ];

  it.each(books)('$file: is the book it should be, and is cut into sensible excerpts', ({ file: name, entry: e, chapters }) => {
    const raw = readFileSync(`data/texts/${name}-raw.txt`, 'utf-8');
    expect(checkHeader(raw, e).ok).toBe(true);
    const excerpts = cutBook(raw, e);

    for (const x of excerpts) {
      expect(x.wordCount).toBeGreaterThanOrEqual(1);
      expect(x.wordCount).toBeLessThanOrEqual(MAX_WORDS + MIN_TAIL_WORDS);
      expect(x.sourceText).not.toMatch(/Project Gutenberg|\*\*\*|\r/i);
      expect(x.sourceText).toBe(x.sourceText.trim());
    }
    expect(excerpts.map(x => x.ordinal)).toEqual(excerpts.map((_, i) => i + 1));
    expect(new Set(excerpts.map(x => x.id)).size).toBe(excerpts.length);
    const mean = excerpts.reduce((s, x) => s + x.wordCount, 0) / excerpts.length;
    expect(mean).toBeGreaterThan(400);
    expect(mean).toBeLessThan(560);

    if (chapters > 0) {
      const names = new Set(excerpts.map(x => x.title.replace(/ \(\d+ of \d+\)$/, '')));
      expect(names.size).toBeGreaterThanOrEqual(chapters - 2);
      expect(names.size).toBeLessThanOrEqual(chapters + 2);
    }
  });

  it('loses no word of the book in the cutting (Walden has no chapters found, so everything is kept)', () => {
    const raw = readFileSync('data/texts/walden-raw.txt', 'utf-8');
    const paragraphs = paragraphsOf(stripGutenberg(raw));
    const kept = cutBook(raw, books[2].entry).reduce((sum, x) => sum + x.wordCount, 0);
    expect(kept).toBe(paragraphs.reduce((sum, p) => sum + wordCount(p), 0));
  });

  it('finds Jane Eyre’s first chapter at the words the bundled excerpt starts with', () => {
    const raw = readFileSync('data/texts/jane-eyre-raw.txt', 'utf-8');
    const [first] = cutBook(raw, books[0].entry);
    expect(first.title).toBe('Jane Eyre — Chapter I (1 of 4)');
    expect(first.sourceText.startsWith('There was no possibility of taking a walk that day.')).toBe(true);
  });
});
