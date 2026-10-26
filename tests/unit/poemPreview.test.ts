import { describe, it, expect } from 'vitest';
import { poemPreview } from '@/lib/poems/preview';
import { PREVIEW_LINES, PREVIEW_WORDS_PER_LINE, previewHeadOf, summarizePoem, type Poem } from '@/lib/models';
import { poemLines } from '@/lib/export/text';
import { tokenize } from '@/lib/tokenizer';

// one(0) two(1) three(2) ... twelve(11)
const passage = { tokens: tokenize('p', 'one two three four five six seven eight nine ten eleven twelve') };
const id = (i: number) => passage.tokens.filter(t => t.kind === 'word')[i].id;
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => id(from + i));
const preview = (poem: { retainedTokenIds: string[]; lineBreaks: string[] }, from: { tokens: typeof passage.tokens } | null = passage) =>
  poemPreview(previewHeadOf(poem), from ?? undefined);

describe('the start of a saved poem', () => {
  it('gives the first three lines as the writer broke them', () => {
    const poem = { retainedTokenIds: ids(0, 8), lineBreaks: [id(1), id(4), id(7)] };
    // one two / three four five / six seven eight / nine
    expect(preview(poem)).toEqual({ lines: ['one two', 'three four five', 'six seven eight'], more: true });
  });

  it('says there is no more when the poem has exactly three lines', () => {
    const poem = { retainedTokenIds: ids(0, 7), lineBreaks: [id(1), id(4)] };
    expect(preview(poem)).toEqual({ lines: ['one two', 'three four five', 'six seven eight'], more: false });
  });

  it('says there is no more when a break follows the last word of the third line, and there is nothing after it', () => {
    const poem = { retainedTokenIds: ids(0, 7), lineBreaks: [id(1), id(4), id(7)] };
    expect(preview(poem)).toEqual({ lines: ['one two', 'three four five', 'six seven eight'], more: false });
  });

  it('takes the words the poem keeps, in order, skipping the erased ones', () => {
    const poem = { retainedTokenIds: [id(0), id(3), id(9)], lineBreaks: [id(3)] };
    expect(preview(poem)).toEqual({ lines: ['one four', 'ten'], more: false });
  });

  it('is one line when the poem has no breaks', () => {
    expect(preview({ retainedTokenIds: ids(0, 3), lineBreaks: [] })).toEqual({ lines: ['one two three four'], more: false });
  });

  it('cuts a long line at a whole word and ends it with an ellipsis', () => {
    const long = { tokens: tokenize('q', Array.from({ length: 20 }, () => 'word').join(' ')) };
    const words = long.tokens.filter(t => t.kind === 'word');
    // 20 words are 99 characters; 12 fit in 60 (12 x 4 + 11 spaces = 59)
    expect(preview({ retainedTokenIds: words.map(t => t.id), lineBreaks: [] }, long)).toEqual({
      lines: [`${Array.from({ length: 12 }, () => 'word').join(' ')}…`],
      more: false,
    });
  });

  it('cuts a single very long word where it stands', () => {
    const odd = { tokens: tokenize('r', 'x'.repeat(70)) };
    const [word] = odd.tokens.filter(t => t.kind === 'word');
    expect(preview({ retainedTokenIds: [word.id], lineBreaks: [] }, odd)).toEqual({ lines: [`${'x'.repeat(60)}…`], more: false });
  });

  it('shows nothing for a poem with no words kept', () => {
    expect(preview({ retainedTokenIds: [], lineBreaks: [] })).toEqual({ lines: [], more: false });
  });

  it('is null when its passage is not in the library, or one of the words shown is not in the passage', () => {
    expect(preview({ retainedTokenIds: ids(0, 2), lineBreaks: [] }, null)).toBeNull();
    expect(preview({ retainedTokenIds: [id(0), 'p-token-9999'], lineBreaks: [] })).toBeNull();
  });
});

describe('the head of a poem that a list keeps', () => {
  it('holds the ids of the first three lines and says whether there is more', () => {
    const poem = { retainedTokenIds: ids(0, 8), lineBreaks: [id(1), id(4), id(7)] };
    expect(previewHeadOf(poem)).toEqual({ lines: [[id(0), id(1)], [id(2), id(3), id(4)], [id(5), id(6), id(7)]], more: true });
    expect(PREVIEW_LINES).toBe(3);
  });

  it('keeps no more words of a line than could be shown in 60 characters', () => {
    const many = Array.from({ length: 200 }, (_, i) => `w-${i}`);
    const head = previewHeadOf({ retainedTokenIds: many, lineBreaks: [] });
    expect(head.lines).toHaveLength(1);
    expect(head.lines[0]).toHaveLength(PREVIEW_WORDS_PER_LINE);
    expect(head.lines[0]).toEqual(many.slice(0, PREVIEW_WORDS_PER_LINE));
    // 31 one-letter words and the spaces between them are already 61 characters: past the 60 shown.
    expect(PREVIEW_WORDS_PER_LINE + (PREVIEW_WORDS_PER_LINE - 1)).toBeGreaterThan(60);
  });

  it('still finds the later lines when an earlier line is very long', () => {
    const many = Array.from({ length: 100 }, (_, i) => `w-${i}`);
    const head = previewHeadOf({ retainedTokenIds: many, lineBreaks: [many[49], many[59], many[69]] });
    expect(head.lines.map(line => line.length)).toEqual([PREVIEW_WORDS_PER_LINE, 10, 10]);
    expect(head.lines[1][0]).toBe('w-50');
    expect(head.more).toBe(true);
  });

  it('gives the same text as working it out from the whole poem, whatever the poem (checked on many)', () => {
    // A passage of words of every length from one to nine letters, and poems with every kind of break.
    const text = Array.from({ length: 400 }, (_, i) => 'abcdefghi'.slice(0, (i * 7) % 9 + 1)).join(' ');
    const long = { tokens: tokenize('z', text) };
    const words = long.tokens.filter(t => t.kind === 'word');
    let seed = 12345;
    const next = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 300; trial++) {
      const kept = words.filter(() => next(100) < 5 + next(90));
      const breaks = kept.filter(() => next(100) < next(40)).map(t => t.id);
      const poem = { retainedTokenIds: kept.map(t => t.id), lineBreaks: breaks };
      // The whole poem, the way it was done before there were summaries.
      const whole = poemLines(kept, new Set(breaks));
      const clip = (line: string) => {
        if (line.length <= 60) return line;
        const cut = line.slice(0, 60);
        return `${cut.replace(/\s+\S*$/, '') || cut}…`;
      };
      const expected = { lines: whole.slice(0, 3).map(clip), more: whole.length > 3 };
      expect(preview(poem, long)).toEqual(expected);
    }
  });
});

describe('a poem’s summary', () => {
  const full: Poem = {
    id: 'a', schemaVersion: 2, revision: 3, passageId: 'p', passageVersion: 't1-0123456789abcdef', title: 'T', notes: 'private notes',
    retainedTokenIds: ids(0, 4), lineBreaks: [id(1)], erasureStyle: 'faded', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  };

  it('has what a list shows, and not the words, the breaks or the notes', () => {
    const summary = summarizePoem(full);
    expect(summary).toEqual({
      id: 'a', passageId: 'p', passageVersion: 't1-0123456789abcdef', revision: 3, title: 'T', erasureStyle: 'faded', wordCount: 5,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', preview: { lines: [[id(0), id(1)], [id(2), id(3), id(4)]], more: false },
    });
    expect(JSON.stringify(summary)).not.toContain('private notes');
  });

  it('does not make up a title or a passage version', () => {
    const bare = { ...full };
    delete bare.title;
    delete bare.passageVersion;
    const summary = summarizePoem(bare);
    expect('title' in summary).toBe(false);
    expect('passageVersion' in summary).toBe(false);
  });
});
