import { describe, it, expect } from 'vitest';
import { poemLines, poemToText } from '@/lib/export/text';
import { exportFilename } from '@/lib/export/png';
import type { Attribution, Token } from '@/lib/models';

const attribution: Attribution = {
  title: 'Walden',
  author: 'Henry David Thoreau',
  year: 1854,
  source: 'Project Gutenberg',
  url: 'https://www.gutenberg.org/ebooks/205',
  licenseNote: 'Public domain in the USA',
};

const word = (i: number, text: string): Token => ({
  id: `p-token-${String(i).padStart(4, '0')}`,
  text,
  word: text.toLowerCase(),
  position: i,
  paragraphIndex: 0,
  lineBreakBefore: false,
  kind: 'word',
  isSelectable: true,
});

// "to front only / the essential facts, / of life"
const tokens = ['to', 'front', 'only', 'the', 'essential', 'facts,', 'of', 'life'].map((t, i) => word(i, t));
const breaks = new Set([tokens[2].id, tokens[5].id]);

describe('poemLines', () => {
  it('ends a line after each word with a break, and keeps the words in order', () => {
    expect(poemLines(tokens, breaks)).toEqual(['to front only', 'the essential facts,', 'of life']);
  });

  it('makes one line when there are no breaks', () => {
    expect(poemLines(tokens, new Set())).toEqual(['to front only the essential facts, of life']);
  });

  it('adds no empty line for a break after the last word', () => {
    expect(poemLines(tokens, new Set([tokens[7].id]))).toEqual(['to front only the essential facts, of life']);
  });

  it('makes no lines from no words', () => {
    expect(poemLines([], new Set())).toEqual([]);
  });

  it('ignores a break that belongs to a word that is not in the poem', () => {
    expect(poemLines(tokens.slice(0, 2), new Set([tokens[4].id]))).toEqual(['to front']);
  });
});

describe('poemToText', () => {
  it('writes the title, the lines and the source', () => {
    expect(poemToText({ title: 'Winter', lines: ['to front only', 'of life'], attribution })).toBe(
      [
        'Winter',
        '',
        'to front only',
        'of life',
        '',
        'Found in Walden, Henry David Thoreau (1854)',
        'Source: Project Gutenberg, https://www.gutenberg.org/ebooks/205',
        '',
      ].join('\n')
    );
  });

  it('calls an empty title "Untitled poem" and flattens one typed across lines', () => {
    expect(poemToText({ title: '  ', lines: ['a'], attribution }).split('\n')[0]).toBe('Untitled poem');
    expect(poemToText({ title: 'Two\n  lines', lines: ['a'], attribution }).split('\n')[0]).toBe('Two lines');
  });
});

describe('export file names', () => {
  it('uses the same name for every format, changing only the extension', () => {
    expect(exportFilename('Winter Twilight', 'poem', 'txt')).toBe('palimpsest-winter-twilight-poem.txt');
    expect(exportFilename('Winter Twilight', 'poem')).toBe('palimpsest-winter-twilight-poem.png');
  });
});
