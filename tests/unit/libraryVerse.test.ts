import { describe, it, expect } from 'vitest';
import { LINE_SEPARATOR, MAX_WORDS, MIN_TAIL_WORDS, TARGET_WORDS, cutBook, paragraphsOf, sectionsOf, windowsOf, wordCount } from '../../scripts/library/cut.mjs';
import { tokenize } from '@/lib/tokenizer';

// Verse: the lines of a stanza stay separate, a poem's title is a heading, short poems are packed into an excerpt
// and a long one is cut at the end of a line. (Prose is pinned elsewhere: libraryProsePinned.test.ts.)

const LS = LINE_SEPARATOR;

/** A stanza of `lines` lines of `wordsPerLine` words, every word marked so that it can be followed. */
const stanza = (mark: string, lines = 4, wordsPerLine = 7) =>
  Array.from({ length: lines }, (_, l) => `    ${Array.from({ length: wordsPerLine }, (_, w) => `${mark}${l}x${w}`).join(' ')}${l === lines - 1 ? '.' : ','}`).join('\n');
const poem = (title: string, stanzas: number, mark: string, lines = 4, wordsPerLine = 7) =>
  [title, ...Array.from({ length: stanzas }, (_, s) => stanza(`${mark}s${s}`, lines, wordsPerLine))].join('\n\n');
const file = (body: string, title = 'Poems', author = 'Poet, A.') =>
  `Title: ${title}\n\nAuthor: ${author}\n\n*** START OF THE PROJECT GUTENBERG EBOOK POEMS ***\n\n${body}\n\n*** END OF THE PROJECT GUTENBERG EBOOK POEMS ***\n`;
const entry = { gutenbergId: 9, title: 'Poems', author: 'A. Poet', year: 1850, form: 'verse' };
const words = (text: string) => text.split(/\s+/).filter(Boolean);

describe('the paragraphs of a book of verse', () => {
  it('keep the lines of a stanza apart, without the indentation, so that nothing runs on', () => {
    const out = paragraphsOf('   Line one,\n      line _two_,\n   line three.\n\n Next stanza.', { verse: true });
    expect(out).toEqual([`Line one,${LS}line two,${LS}line three.`, 'Next stanza.']);
  });

  it('are run together as before when the book is prose', () => {
    expect(paragraphsOf('Line one,\nline two.\n\nNext.')).toEqual(['Line one, line two.', 'Next.']);
  });

  it('leave out ornaments, illustrations and credits as prose does', () => {
    const out = paragraphsOf('Produced by Volunteers\n\n* * * * *\n\n[Illustration: a bird]\n\nA line,\nanother.', { verse: true });
    expect(out).toEqual([`A line,${LS}another.`]);
  });
});

describe('the poems of a book of verse', () => {
  const paragraphs = (...titles: string[]) =>
    paragraphsOf(titles.map((t, i) => poem(t, 2, `p${i}`)).join('\n\n'), { verse: true });

  it('begin at a title in capitals on a line of its own', () => {
    const sections = sectionsOf(paragraphs('THE RAVEN', 'ANNABEL LEE', 'THE BELLS'), { verse: true });
    expect(sections.map(s => s.label)).toEqual(['The Raven', 'Annabel Lee', 'The Bells']);
    expect(sections.every(s => s.paragraphs.length === 2)).toBe(true);
  });

  it('are found by BOOK and CANTO headings and by a number with a title, as in prose', () => {
    const sections = sectionsOf(paragraphs('BOOK I', 'BOOK II', 'CANTO III', 'IV. A TITLE'), { verse: true });
    expect(sections.map(s => s.label)).toEqual(['Book I', 'Book II', 'Canto III', 'IV. A Title']);
  });

  it('are not found in a stanza, a line in ordinary case, or a shout in capitals inside a stanza', () => {
    const sections = sectionsOf(
      paragraphsOf(`THE FIRST\n\nStanza one line,\nTO ARMS, TO ARMS!\nline three.\n\nTHE SECOND\n\nA stanza.\n\nTHE THIRD\n\nAnother stanza.\n\nA Line In Ordinary Case`, { verse: true }),
      { verse: true }
    );
    expect(sections.map(s => s.label)).toEqual(['The First', 'The Second', 'The Third']);
    expect(sections[0].paragraphs).toHaveLength(1);
    expect(sections[2].paragraphs).toEqual(['Another stanza.', 'A Line In Ordinary Case']);
  });

  it('are one run of text when fewer than three titles are found', () => {
    const sections = sectionsOf(paragraphs('ONE', 'TWO'), { verse: true });
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
  });
});

describe('excerpts of verse', () => {
  const cut = (body: string) => cutBook(file(body), entry);

  it('pack short poems together until there are about as many words as an excerpt, and name them by their titles', () => {
    // twelve poems of 56 words (2 stanzas of 4 lines of 7 words)
    const body = Array.from({ length: 12 }, (_, i) => poem(`POEM ${String.fromCharCode(65 + i)}`, 2, `q${i}`)).join('\n\n');
    const excerpts = cut(body);
    expect(excerpts.length).toBeGreaterThan(0);
    expect(excerpts[0].title).toMatch(/^Poems — Poem A · Poem B · Poem C · /);
    expect(excerpts[0].title.length).toBeLessThanOrEqual('Poems — '.length + 91);
    for (const x of excerpts) {
      expect(x.wordCount).toBeGreaterThanOrEqual(MIN_TAIL_WORDS);
      expect(x.wordCount).toBeLessThanOrEqual(MAX_WORDS + MIN_TAIL_WORDS);
    }
    expect(excerpts[0].wordCount).toBeGreaterThanOrEqual(TARGET_WORDS - 56);
  });

  it('put each poem’s title in the text when there are several in an excerpt, and none when a poem is alone', () => {
    const several = cut(Array.from({ length: 10 }, (_, i) => poem(`POEM ${String.fromCharCode(65 + i)}`, 2, `q${i}`)).join('\n\n'));
    expect(several[0].sourceText).toContain('Poem A\n\n');
    expect(several[0].sourceText).toContain('Poem B\n\n');
    const alone = cut([poem('ONE', 20, 'a'), poem('TWO', 20, 'b'), poem('THREE', 20, 'c')].join('\n\n'));
    expect(alone.map(x => x.title)).toEqual(['Poems — One', 'Poems — Two', 'Poems — Three']);
    expect(alone[0].sourceText.startsWith('a')).toBe(true); // no title line in the text
    expect(alone[0].sourceText).not.toMatch(/One/);
  });

  it('cut a long poem at the end of a stanza or a line, never in the middle of one, and name the parts', () => {
    const long = poem('THE LONG POEM', 40, 'L', 6, 8); // 40 stanzas of 48 words: 1,920 words
    const excerpts = cut([long, poem('SHORT ONE', 2, 's'), poem('SHORT TWO', 2, 't')].join('\n\n'));
    const parts = excerpts.filter(x => x.title.includes('The Long Poem'));
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts[0].title).toBe(`Poems — The Long Poem (1 of ${parts.length})`);
    for (const part of parts) {
      expect(part.wordCount).toBeLessThanOrEqual(MAX_WORDS + MIN_TAIL_WORDS);
      for (const stanzaText of part.sourceText.split('\n\n')) expect(stanzaText.split(LS)).toHaveLength(6); // whole stanzas, whole lines
    }
  });

  it('cut a long unbroken run of lines (an epic with no blank lines) at the end of a line', () => {
    const lines = Array.from({ length: 300 }, (_, l) => `    ${Array.from({ length: 9 }, (_, w) => `e${l}x${w}`).join(' ')}`).join('\n'); // 2,700 words
    const book = ['BOOK I', lines, 'BOOK II', stanza('b', 20, 9), 'BOOK III', stanza('c', 20, 9)].join('\n\n');
    const excerpts = cut(book);
    const first = excerpts.filter(x => x.title.includes('Book I ('));
    expect(first.length).toBeGreaterThanOrEqual(5);
    for (const part of first) {
      expect(part.wordCount).toBeLessThanOrEqual(MAX_WORDS + MIN_TAIL_WORDS);
      for (const line of part.sourceText.split('\n\n').flatMap((block: string) => block.split(LS))) expect(words(line)).toHaveLength(9); // every line whole
    }
  });

  it('lose no word, and add none but the titles of poems packed together', () => {
    const poems = Array.from({ length: 9 }, (_, i) => poem(`POEM ${i}`, 3, `z${i}`));
    const excerpts = cut(poems.join('\n\n'));
    const kept = excerpts.flatMap(x => words(x.sourceText)).filter(w => /^z\dsx?\d*x\d+[.,]?$/.test(w) || /^z\d/.test(w));
    const expected = poems.flatMap(p => words(p)).filter(w => /^z\d/.test(w));
    expect(kept.map(w => w.replace(/[.,]$/, ''))).toEqual(expected.map(w => w.replace(/[.,]$/, '')));
  });

  it('keep the lines in the text, and show them as lines when the tokenizer reads it', () => {
    const [first] = cut([poem('ONE', 8, 'a'), poem('TWO', 8, 'b'), poem('THREE', 8, 'c')].join('\n\n'));
    expect(first.sourceText).toContain(LS);
    const tokens = tokenize(first.id, first.sourceText);
    const starts = tokens.filter(t => t.lineStart).length;
    const stanzas = first.sourceText.split('\n\n').filter((block: string) => block.includes(LS)).length;
    expect(starts).toBe(stanzas * 3); // four lines in a stanza: three of them start a line after the first
  });

  it('describe an excerpt in its first words, on one line', () => {
    const [first] = cut([poem('ONE', 20, 'a'), poem('TWO', 20, 'b'), poem('THREE', 20, 'c')].join('\n\n'));
    expect(first.description).not.toContain(LS);
    expect(first.description).toMatch(/^as00x0 as00x1/);
  });

  it('are numbered parts of one run when no poem titles are found, with the stanzas kept', () => {
    const excerpts = cut(Array.from({ length: 30 }, (_, i) => stanza(`n${i}`, 6, 9)).join('\n\n'));
    expect(excerpts[0].title).toBe('Poems — Part 1');
    expect(excerpts[0].sourceText.split('\n\n')[0].split(LS)).toHaveLength(6);
    for (const x of excerpts.slice(0, -1)) expect(x.wordCount).toBeGreaterThanOrEqual(MIN_TAIL_WORDS);
  });

  it('are cut the same way every time', () => {
    const body = [poem('ONE', 12, 'a'), poem('TWO', 12, 'b'), poem('THREE', 12, 'c')].join('\n\n');
    expect(cut(body)).toEqual(cut(body));
  });

  it('are cut as prose when the book is not listed as verse, so the lines run on as before', () => {
    const excerpts = cutBook(file([poem('ONE', 12, 'a'), poem('TWO', 12, 'b'), poem('THREE', 12, 'c')].join('\n\n')), { ...entry, form: undefined });
    expect(excerpts.some(x => x.sourceText.includes(LS))).toBe(false);
  });

  it('use windowsOf for prose exactly as before', () => {
    expect(windowsOf(['a b c d.']).map(w => w.words)).toEqual([4]);
    expect(wordCount(`a${LS}b c`)).toBe(3);
  });
});
