// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { tokenize } from '@/lib/tokenizer';
import { BookText } from '@/components/BookText';
import type { Token } from '@/lib/models';
import { render } from '../helpers/react';

// Lines of verse: a line separator in the text makes the first word after it start a line on the page, and changes
// nothing else: no word, no id. Prose has none, so its tokens do not have the field at all.

const LS = ' ';
const poem = `Once upon a midnight dreary,${LS}while I pondered, weak and weary,${LS}Over many a quaint—and curious volume\n\nSecond stanza here,${LS}and its second line.`;

describe('lines of verse in the tokenizer', () => {
  it('mark the first word of every line after the first of a stanza, and no other word', () => {
    const tokens = tokenize('p', poem);
    const starts = tokens.filter(t => t.lineStart).map(t => t.text);
    expect(starts).toEqual(['while', 'Over', 'and']);
    expect(tokens.filter(t => t.lineStart === false)).toEqual([]); // never false: it is there or it is not
  });

  it('give the same words and the same ids as the text with spaces in place of the line separators', () => {
    const withSpaces = poem.replaceAll(LS, ' ');
    const a = tokenize('p', poem);
    const b = tokenize('p', withSpaces);
    expect(a.map(t => ({ ...t, lineStart: undefined }))).toEqual(b.map(t => ({ ...t, lineStart: undefined })));
    expect(a.map(t => t.id)).toEqual(b.map(t => t.id));
  });

  it('mark a dash that begins a line, as it begins it', () => {
    const tokens = tokenize('p', `one two${LS}—three four`);
    expect(tokens.find(t => t.lineStart)?.text).toBe('—');
    expect(tokens.find(t => t.lineStart)?.isSelectable).toBe(false);
  });

  it('carry the mark over a line with nothing on it', () => {
    const tokens = tokenize('p', `one${LS}${LS}two`);
    expect(tokens.map(t => t.lineStart)).toEqual([undefined, true]);
  });

  it('leave a stanza’s first word alone, and keep paragraph breaks as they were', () => {
    const tokens = tokenize('p', poem);
    expect(tokens.find(t => t.text === 'Once')?.lineStart).toBeUndefined();
    expect(tokens.find(t => t.text === 'Second')?.lineBreakBefore).toBe(true);
    expect(tokens.find(t => t.text === 'Second')?.lineStart).toBeUndefined();
  });

  it('give prose tokens no mark at all, so that they are as they always were', () => {
    const prose = tokenize('p', 'Hard-wrapped prose\nruns on here—and there.\n\nA second paragraph.');
    expect(prose.every(t => !('lineStart' in t))).toBe(true);
  });
});

describe('verse on the page', () => {
  const group = (tokens: Token[]) => {
    const paragraphs: Token[][] = [];
    for (const t of tokens) (paragraphs[t.paragraphIndex] ??= []).push(t);
    return paragraphs;
  };
  const view = (text: string) =>
    render(createElement(BookText, { paragraphs: group(tokenize('p', text)), retainedSet: new Set<string>(), style: 'blackout', onToggle: () => {} }));

  it('shows each line of a stanza on its own line, and a stanza without the indent of a paragraph', () => {
    const { container } = view(poem);
    const stanzas = container.querySelectorAll('p');
    expect(stanzas).toHaveLength(2);
    expect(stanzas[0].querySelectorAll('br')).toHaveLength(2);
    expect(stanzas[1].querySelectorAll('br')).toHaveLength(1);
    expect(stanzas[0].className).not.toContain('indent-6');
  });

  it('shows prose as before: run on, with the first line indented, and no line breaks', () => {
    const { container } = view('Prose runs\non here.\n\nAnother paragraph.');
    expect(container.querySelectorAll('br')).toHaveLength(0);
    expect([...container.querySelectorAll('p')].every(p => p.className.includes('indent-6'))).toBe(true);
  });

  it('keeps every word a button, in order, with a line break in front of the right ones', () => {
    const { container } = view(poem);
    const words = [...container.querySelectorAll('button[data-token-id]')].map(b => b.textContent);
    expect(words.slice(0, 5)).toEqual(['Once', 'upon', 'a', 'midnight', 'dreary,']);
    const second = [...container.querySelectorAll('button[data-token-id]')].find(b => b.textContent === 'while')!;
    expect(second.previousElementSibling?.tagName).toBe('BR');
  });
});
