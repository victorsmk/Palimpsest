import { describe, it, expect } from 'vitest';
import type { Passage, Poem, Token } from '@/lib/models';
import { collectionTextFilename, collectionToText } from '@/lib/export/collectionText';

// The collection as one plain text file a person can open: what is in it, in what order, and what is left out and said so.

const token = (n: number, text: string, isSelectable = true): Token => ({
  id: `t${n}`,
  text,
  word: text.toLowerCase(),
  position: n,
  paragraphIndex: 0,
  lineBreakBefore: false,
  kind: isSelectable ? 'word' : 'separator',
  isSelectable,
});

const passage = (id: string, title: string, words: string[]): Passage => ({
  id,
  bookId: id,
  title,
  description: '',
  sourceText: words.join(' '),
  tokens: words.map((w, i) => token(i, w, w !== '—')),
  attribution: { title, author: 'An Author', year: 1854, source: 'Project Gutenberg', url: 'https://example.org', licenseNote: '' },
});

const walden = passage('walden', 'Walden', ['I', 'went', 'to', 'the', 'woods', '—', 'because', 'I', 'wished', 'to', 'live']);
const passages = new Map([[walden.id, walden]]);

const poem = (overrides: Partial<Poem> = {}): Poem => ({
  id: 'p',
  schemaVersion: 2,
  revision: 1,
  passageId: 'walden',
  retainedTokenIds: ['t1', 't4', 't6', 't8'],
  lineBreaks: ['t4'],
  erasureStyle: 'blackout',
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  title: 'Went Woods',
  ...overrides,
});

const NOW = new Date(2026, 9, 28, 12, 0, 0);

describe('the text of a collection', () => {
  it('writes a poem as its title, its lines, and where it was found', () => {
    const { text, written, skipped } = collectionToText([poem()], passages, NOW);
    expect(written).toBe(1);
    expect(skipped).toBe(0);
    expect(text).toContain('Went Woods\n\nwent woods\nbecause wished\n\nFound in Walden, An Author (1854)');
  });

  it('starts with a heading that counts the poems and gives the date', () => {
    const { text } = collectionToText([poem(), poem({ id: 'q' })], passages, NOW);
    expect(text.startsWith('My poems from Palimpsest\n2 poems, downloaded 28 October 2026')).toBe(true);
    expect(collectionToText([poem()], passages, NOW).text).toContain('1 poem, downloaded');
  });

  it('puts a line between poems, in the order given', () => {
    const { text } = collectionToText([poem({ title: 'First' }), poem({ id: 'q', title: 'Second' })], passages, NOW);
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
    expect(text).toContain('\n\n----------------------------------------\n\nSecond');
  });

  it('takes the words in the order of the text, whatever order the poem lists them in', () => {
    const { text } = collectionToText([poem({ retainedTokenIds: ['t8', 't1', 't6', 't4'], lineBreaks: [] })], passages, NOW);
    expect(text).toContain('\nwent woods because wished\n');
  });

  it('does not take a dash for a word: a poem that holds one cannot be written faithfully, so it is left out', () => {
    const { written, skipped } = collectionToText([poem({ retainedTokenIds: ['t1', 't5'] })], passages, NOW);
    expect([written, skipped]).toEqual([0, 1]);
  });

  it('gives an untitled poem a name, and a title on one line', () => {
    expect(collectionToText([poem({ title: undefined })], passages, NOW).text).toContain('\n\nUntitled poem\n');
    expect(collectionToText([poem({ title: '  Two\n  lines ' })], passages, NOW).text).toContain('\n\nTwo lines\n');
  });

  it('adds the writer’s notes, when there are some', () => {
    expect(collectionToText([poem({ notes: 'kept for\nspring' })], passages, NOW).text).toContain('Found in Walden, An Author (1854)\n\nNotes:\nkept for\nspring');
    expect(collectionToText([poem({ notes: '   ' })], passages, NOW).text).not.toContain('Notes:');
    expect(collectionToText([poem({ notes: undefined })], passages, NOW).text).not.toContain('Notes:');
  });

  it('leaves out a poem whose text cannot be found, or no longer has its words, and says how many', () => {
    const { text, written, skipped } = collectionToText(
      [poem({ title: 'Kept' }), poem({ id: 'a', title: 'Lost text', passageId: 'missing' }), poem({ id: 'b', title: 'Lost word', retainedTokenIds: ['t1', 'gone'] })],
      passages,
      NOW
    );
    expect(written).toBe(1);
    expect(skipped).toBe(2);
    expect(text).toContain('Kept');
    expect(text).not.toContain('Lost text');
    expect(text).not.toContain('Lost word');
    expect(text).toContain('2 poems were left out because the text they were found in could not be opened.');
    expect(text).toContain('1 poem, downloaded');
  });

  it('says it in the singular for one', () => {
    expect(collectionToText([poem({ passageId: 'missing' })], passages, NOW).text).toContain('1 poem was left out because the text it was found in could not be opened.');
  });

  it('does not mention anything left out when nothing was', () => {
    expect(collectionToText([poem()], passages, NOW).text).not.toContain('left out');
  });

  it('ends with a newline, and has no machine-looking text: no ids, no braces', () => {
    const { text } = collectionToText([poem()], passages, NOW);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).not.toMatch(/[{}\[\]]|t\d|schemaVersion|revision/);
  });

  it('is only the heading for an empty collection', () => {
    expect(collectionToText([], passages, NOW)).toEqual({ text: 'My poems from Palimpsest\n0 poems, downloaded 28 October 2026\n', written: 0, skipped: 0 });
  });

  it('names its file for the date', () => {
    expect(collectionTextFilename(new Date(2026, 0, 5))).toBe('palimpsest-poems-2026-01-05.txt');
    expect(collectionTextFilename(new Date(2026, 10, 28))).toBe('palimpsest-poems-2026-11-28.txt');
  });
});
