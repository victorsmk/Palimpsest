import { describe, it, expect } from 'vitest';
import { cutUserText, paragraphsOf, normalizeText, countWords, LINE_SEPARATOR } from '@/lib/userTexts/cut';
import { tokenize } from '@/lib/tokenizer';

const words = (n: number, tag = 'w') => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
const sentence = (n: number, tag: string) => `${words(n, tag)}.`;
const allWords = (excerpts: string[]) => excerpts.join(' ').split(/\s+/).filter(Boolean);

describe('normalizing a text', () => {
  it('has one kind of line end, no byte order mark, and no line or paragraph separators of its own', () => {
    expect(normalizeText('﻿one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
    expect(normalizeText(`a b${LINE_SEPARATOR}c d`)).not.toContain(LINE_SEPARATOR);
    expect(normalizeText('a b')).toBe('a b');
  });

  it('puts three or more line ends at the end of a paragraph, and takes off trailing spaces', () => {
    expect(normalizeText('one  \n\n\n\ntwo')).toBe('one\n\ntwo');
  });
});

describe('the paragraphs of a text', () => {
  it('are separated by blank lines, with the lines of a paragraph run together', () => {
    expect(paragraphsOf('Hard-wrapped\nline two.\n\nSecond paragraph.', 'prose')).toEqual(['Hard-wrapped line two.', 'Second paragraph.']);
  });

  it('are a line each when the text has no blank line at all', () => {
    expect(paragraphsOf('First paragraph.\nSecond paragraph.\nThird.', 'prose')).toEqual(['First paragraph.', 'Second paragraph.', 'Third.']);
  });

  it('keep the lines of a stanza in verse, and make a text with no blank line one stanza', () => {
    expect(paragraphsOf('a b\nc d\n\ne f', 'verse')).toEqual([`a b${LINE_SEPARATOR}c d`, 'e f']);
    expect(paragraphsOf('a b\nc d\ne f', 'verse')).toEqual([`a b${LINE_SEPARATOR}c d${LINE_SEPARATOR}e f`]);
  });

  it('are none for a text with nothing in it', () => {
    expect(paragraphsOf('  \n\n \n', 'prose')).toEqual([]);
    expect(cutUserText('', 'prose')).toEqual([]);
  });
});

describe('cutting a text into excerpts', () => {
  it('leaves a short text whole', () => {
    expect(cutUserText('A short text.\n\nTwo paragraphs.', 'prose')).toEqual(['A short text.\n\nTwo paragraphs.']);
  });

  it('packs paragraphs into excerpts of about 450 words and cuts only between paragraphs', () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => sentence(100, `p${i}x`));
    const excerpts = cutUserText(paragraphs.join('\n\n'), 'prose');
    expect(excerpts.length).toBe(3);
    for (const [index, excerpt] of excerpts.entries()) {
      // all but the last are about a page; the last is what is left
      if (index < excerpts.length - 1) expect(countWords(excerpt)).toBeGreaterThanOrEqual(400);
      expect(countWords(excerpt)).toBeLessThanOrEqual(650);
      // each excerpt is whole paragraphs
      for (const paragraph of excerpt.split('\n\n')) expect(paragraphs).toContain(paragraph);
    }
    expect(allWords(excerpts)).toEqual(allWords(paragraphs));
  });

  it('joins a short last piece to the one before it', () => {
    const excerpts = cutUserText([sentence(460, 'a'), sentence(100, 'b')].join('\n\n'), 'prose');
    expect(excerpts).toHaveLength(1);
    expect(countWords(excerpts[0])).toBe(560);
  });

  it('keeps a last piece of a fair size on its own', () => {
    const excerpts = cutUserText([sentence(460, 'a'), sentence(300, 'b')].join('\n\n'), 'prose');
    expect(excerpts).toHaveLength(2);
  });

  it('cuts a paragraph longer than a page at the ends of sentences', () => {
    const paragraph = Array.from({ length: 30 }, (_, i) => sentence(100, `s${i}x`)).join(' ');
    const excerpts = cutUserText(paragraph, 'prose');
    expect(excerpts.length).toBeGreaterThan(4);
    for (const [index, excerpt] of excerpts.entries()) {
      expect(excerpt.trim().endsWith('.')).toBe(true);
      // a page of sentences of 100 words each: five of them, 500 words, and no more
      if (index < excerpts.length - 1) expect(countWords(excerpt)).toBe(500);
    }
    expect(allWords(excerpts)).toEqual(allWords([paragraph]));
  });

  it('cuts a long run with no sentence end by words, without losing or repeating one', () => {
    const run = words(2000, 'u');
    const excerpts = cutUserText(run, 'prose');
    expect(excerpts.length).toBeGreaterThanOrEqual(4);
    expect(allWords(excerpts)).toEqual(allWords([run]));
  });

  it('gives the same excerpts for the same text, and a changed paragraph changes only its own excerpt', () => {
    const paragraphs = Array.from({ length: 15 }, (_, i) => sentence(100, `q${i}x`));
    const before = cutUserText(paragraphs.join('\n\n'), 'prose');
    expect(cutUserText(paragraphs.join('\n\n'), 'prose')).toEqual(before);
    const edited = [...paragraphs];
    edited[13] = sentence(100, 'edited');
    const after = cutUserText(edited.join('\n\n'), 'prose');
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[after.length - 1]).not.toEqual(before[before.length - 1]);
  });

  it('keeps every word, in order, whatever the text', () => {
    const odd = `Title\n\n${words(30)}\n${words(20, 'x')}\n\n\n\n${sentence(700, 'long')} Short one. Another!\n\n${words(5, 'e')}`;
    expect(allWords(cutUserText(odd, 'prose'))).toEqual(allWords(paragraphsOf(odd, 'prose')));
  });
});

describe('cutting verse', () => {
  const stanza = (tag: string) => Array.from({ length: 4 }, (_, i) => `${tag}${i} a b c d e f`).join('\n');

  it('keeps each line, and a blank line between stanzas, and the page can draw it', () => {
    const [excerpt] = cutUserText(`${stanza('one')}\n\n${stanza('two')}`, 'verse');
    const tokens = tokenize('p', excerpt);
    expect(tokens.filter(t => t.lineStart)).toHaveLength(6); // three lines in each stanza start after the first
    expect(excerpt.split('\n\n')).toHaveLength(2);
  });

  it('cuts a long poem between stanzas, and a very long stanza between lines', () => {
    const poem = Array.from({ length: 80 }, (_, i) => stanza(`s${i}x`)).join('\n\n');
    const excerpts = cutUserText(poem, 'verse');
    expect(excerpts.length).toBeGreaterThan(2);
    for (const excerpt of excerpts) for (const block of excerpt.split('\n\n')) expect(block.split(LINE_SEPARATOR)).toHaveLength(4);

    const oneStanza = Array.from({ length: 300 }, (_, i) => `line${i} a b c d e f g`).join('\n');
    const lines = cutUserText(oneStanza, 'verse');
    expect(lines.length).toBeGreaterThan(2);
    for (const excerpt of lines) for (const block of excerpt.split('\n\n')) for (const line of block.split(LINE_SEPARATOR)) expect(line).toMatch(/^line\d+ a b c d e f g$/);
  });
});
