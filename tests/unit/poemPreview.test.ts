import { describe, it, expect } from 'vitest';
import { poemPreview } from '@/lib/poems/preview';
import { tokenize } from '@/lib/tokenizer';

// one(0) two(1) three(2) ... twelve(11)
const passage = { tokens: tokenize('p', 'one two three four five six seven eight nine ten eleven twelve') };
const id = (i: number) => passage.tokens.filter(t => t.kind === 'word')[i].id;
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => id(from + i));

describe('the start of a saved poem', () => {
  it('gives the first three lines as the writer broke them', () => {
    const poem = { retainedTokenIds: ids(0, 8), lineBreaks: [id(1), id(4), id(7)] };
    // one two / three four five / six seven eight / nine
    expect(poemPreview(poem, passage)).toEqual({ lines: ['one two', 'three four five', 'six seven eight'], more: true });
  });

  it('says there is no more when the poem has exactly three lines', () => {
    const poem = { retainedTokenIds: ids(0, 7), lineBreaks: [id(1), id(4)] };
    expect(poemPreview(poem, passage)).toEqual({ lines: ['one two', 'three four five', 'six seven eight'], more: false });
  });

  it('takes the words the poem keeps, in order, skipping the erased ones', () => {
    const poem = { retainedTokenIds: [id(0), id(3), id(9)], lineBreaks: [id(3)] };
    expect(poemPreview(poem, passage)).toEqual({ lines: ['one four', 'ten'], more: false });
  });

  it('is one line when the poem has no breaks', () => {
    expect(poemPreview({ retainedTokenIds: ids(0, 3), lineBreaks: [] }, passage)).toEqual({ lines: ['one two three four'], more: false });
  });

  it('can show more or fewer lines', () => {
    const poem = { retainedTokenIds: ids(0, 8), lineBreaks: [id(1), id(4), id(7)] };
    expect(poemPreview(poem, passage, 2)).toEqual({ lines: ['one two', 'three four five'], more: true });
    expect(poemPreview(poem, passage, 4)).toEqual({ lines: ['one two', 'three four five', 'six seven eight', 'nine'], more: false });
  });

  it('cuts a long line at a whole word and ends it with an ellipsis', () => {
    const long = { tokens: tokenize('q', Array.from({ length: 20 }, () => 'word').join(' ')) };
    const words = long.tokens.filter(t => t.kind === 'word');
    // 20 words are 99 characters; 12 fit in 60 (12 x 4 + 11 spaces = 59)
    expect(poemPreview({ retainedTokenIds: words.map(t => t.id), lineBreaks: [] }, long)).toEqual({
      lines: [`${Array.from({ length: 12 }, () => 'word').join(' ')}…`],
      more: false,
    });
  });

  it('cuts a single very long word where it stands', () => {
    const odd = { tokens: tokenize('r', 'x'.repeat(70)) };
    const [word] = odd.tokens.filter(t => t.kind === 'word');
    expect(poemPreview({ retainedTokenIds: [word.id], lineBreaks: [] }, odd)).toEqual({ lines: [`${'x'.repeat(60)}…`], more: false });
  });

  it('shows nothing for a poem with no words kept', () => {
    expect(poemPreview({ retainedTokenIds: [], lineBreaks: [] }, passage)).toEqual({ lines: [], more: false });
  });

  it('is null when its passage is not in the library, or one of its words is not in the passage', () => {
    expect(poemPreview({ retainedTokenIds: ids(0, 2), lineBreaks: [] }, undefined)).toBeNull();
    expect(poemPreview({ retainedTokenIds: [id(0), 'p-token-9999'], lineBreaks: [] }, passage)).toBeNull();
  });
});
