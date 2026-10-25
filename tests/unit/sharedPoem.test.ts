import { describe, it, expect } from 'vitest';
import {
  FOUND_HANDOFF_INVALID_MESSAGE,
  FOUND_HANDOFF_MISMATCH_MESSAGE,
  FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE,
  MAX_SHARED_TITLE,
  MAX_SHARED_WORDS,
  SHARE_EMPTY_MESSAGE,
  SHARE_TOO_LONG_MESSAGE,
  cleanSharedTitle,
  decodeSharedPoem,
  encodeSharedPoem,
  readHandoff,
  resolveSharedPoem,
  sharedPoemFromEditor,
  sharedPoemHref,
  type SharedPoem,
} from '@/lib/handoff';
import { bundledPassages } from '@/lib/library/bundled';
import { tokenize } from '@/lib/tokenizer';
import type { Passage } from '@/lib/models';

const poem = (overrides: Partial<SharedPoem> = {}): SharedPoem => ({
  passageId: 'walden-woods',
  keptPositions: [14, 15, 16, 20, 23, 24, 25],
  breakAfterPositions: [16, 20],
  erasureStyle: 'blackout',
  title: 'Quiet Woods',
  ...overrides,
});

/** alpha(0) beta(1) —(2) gamma(3) delta(4) epsilon(5) zeta(6) */
const text = 'alpha beta—gamma delta epsilon zeta';
const dashed: Passage = {
  id: 'dashed',
  bookId: 'b',
  title: 'Dashed',
  description: '',
  sourceText: text,
  tokens: tokenize('dashed', text),
  attribution: { title: 'Dashed', author: 'A', year: 1900, source: 'Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/1', licenseNote: 'Public domain in the USA' },
};
const id = (n: number) => `dashed-token-${String(n).padStart(4, '0')}`;

describe('writing a shared poem as a link', () => {
  it('names the passage, the kept words, the breaks, the style and the title', () => {
    expect(encodeSharedPoem(poem())).toBe('poem=walden-woods:14-16,20,23-25:16,20:b:Quiet%20Woods');
    expect(sharedPoemHref(poem())).toBe('/studio#poem=walden-woods:14-16,20,23-25:16,20:b:Quiet%20Woods');
  });

  it('uses one letter for each style', () => {
    expect(encodeSharedPoem(poem({ erasureStyle: 'faded' }))).toContain(':f:');
    expect(encodeSharedPoem(poem({ erasureStyle: 'whiteout' }))).toContain(':w:');
  });

  it('leaves the title empty, and the breaks empty, when there are none', () => {
    expect(encodeSharedPoem(poem({ title: '', breakAfterPositions: [] }))).toBe('poem=walden-woods:14-16,20,23-25::b:');
  });

  it('encodes a title with spaces, accents, symbols and non-Latin text so it stays one safe piece of the link', () => {
    const link = encodeSharedPoem(poem({ title: 'Café #1 — 100% & “quotes” 詩' }));
    expect(link).toMatch(/^poem=walden-woods:[0-9,-]+:[0-9,]*:b:[A-Za-z0-9\-_.!~*'()%]+$/);
    expect(link).not.toMatch(/[ #&?<>"]/);
  });
});

describe('reading a shared poem from a link', () => {
  it('reads a well-formed link, with or without the #', () => {
    expect(decodeSharedPoem('poem=walden-woods:14-16,20,23-25:16,20:b:Quiet%20Woods')).toEqual(poem());
    expect(decodeSharedPoem('#poem=walden-woods:14-16,20,23-25:16,20:b:Quiet%20Woods')).toEqual(poem());
    expect(decodeSharedPoem('poem=p:3::w:')).toEqual({ passageId: 'p', keptPositions: [3], breakAfterPositions: [], erasureStyle: 'whiteout', title: '' });
  });

  it('gives back whatever it was given, for every title worth trying', () => {
    for (const title of ['', 'A', 'Quiet Woods', 'Café #1 — 100% & “quotes” 詩', "It's (fine)!", '<b>not markup</b>', 'a'.repeat(MAX_SHARED_TITLE)]) {
      const original = poem({ title });
      expect(decodeSharedPoem(encodeSharedPoem(original))).toEqual(original);
    }
  });

  it('hands a title back as plain text, exactly as written, never interpreting it', () => {
    expect(decodeSharedPoem('poem=p:3::b:%3Cscript%3Ealert(1)%3C%2Fscript%3E')!.title).toBe('<script>alert(1)</script>');
  });

  it.each([
    ['empty', ''],
    ['another key', 'found=walden-woods:14-28:16,23'],
    ['no passage', 'poem=:3::b:'],
    ['an upper-case passage', 'poem=Walden:3::b:'],
    ['path characters in the passage', 'poem=../x:3::b:'],
    ['missing the title part', 'poem=walden-woods:3::b'],
    ['missing the style', 'poem=walden-woods:3:::'],
    ['an unknown style letter', 'poem=walden-woods:3::x:'],
    ['an upper-case style letter', 'poem=walden-woods:3::B:'],
    ['a style spelled out', 'poem=walden-woods:3::blackout:'],
    ['no kept words', 'poem=walden-woods:::b:'],
    ['words out of order', 'poem=walden-woods:5,3::b:'],
    ['a repeated word', 'poem=walden-woods:3,3::b:'],
    ['overlapping runs', 'poem=walden-woods:3-5,5::b:'],
    ['a reversed run', 'poem=walden-woods:5-3::b:'],
    ['a break after a word that is not kept', 'poem=walden-woods:3,5:4:b:'],
    ['a break after the last word', 'poem=walden-woods:3,5:5:b:'],
    ['breaks out of order', 'poem=walden-woods:1,3,5:3,1:b:'],
    ['a position of seven digits', 'poem=walden-woods:1,1234567::b:'],
    ['301 kept words', 'poem=walden-woods:0-300::b:'],
    ['a huge run', 'poem=walden-woods:0-999999::b:'],
    ['a title with a raw space', 'poem=walden-woods:3::b:two words'],
    ['a title with a raw angle bracket', 'poem=walden-woods:3::b:<b>'],
    ['a title with a raw non-ASCII letter', 'poem=walden-woods:3::b:café'],
    ['a title with a broken escape', 'poem=walden-woods:3::b:%E0%A4%A'],
    ['a title with an escape that is not UTF-8', 'poem=walden-woods:3::b:%FF'],
    ['a title with a line break in it', 'poem=walden-woods:3::b:one%0Atwo'],
    ['a title with a null character', 'poem=walden-woods:3::b:a%00b'],
    ['a title with a Unicode line separator', 'poem=walden-woods:3::b:a%E2%80%A8b'],
    ['a title with a leading space', 'poem=walden-woods:3::b:%20padded'],
    ['a title with a trailing space', 'poem=walden-woods:3::b:padded%20'],
    ['a title over the limit', `poem=walden-woods:3::b:${'a'.repeat(MAX_SHARED_TITLE + 1)}`],
    ['trailing text', 'poem=walden-woods:3::b:Title&x=1'],
    ['an extra part', 'poem=walden-woods:3::b:Title:more'],
  ])('refuses %s', (_name, hash) => {
    expect(decodeSharedPoem(hash)).toBeNull();
  });

  it('allows exactly 300 words and no more', () => {
    expect(decodeSharedPoem('poem=walden-woods:0-299::b:')?.keptPositions).toHaveLength(MAX_SHARED_WORDS);
    expect(decodeSharedPoem(`poem=walden-woods:${Array.from({ length: 301 }, (_, i) => i * 2).join(',')}::b:`)).toBeNull();
  });

  it('allows a title of exactly the limit, in characters', () => {
    expect(decodeSharedPoem(`poem=walden-woods:3::b:${'a'.repeat(MAX_SHARED_TITLE)}`)?.title).toHaveLength(MAX_SHARED_TITLE);
  });
});

describe('making a shared poem from the editor', () => {
  const snapshot = {
    retainedTokenIds: [id(0), id(3), id(5), id(6)],
    lineBreaks: [id(3)],
    erasureStyle: 'faded' as const,
    title: '  Quiet   Woods ',
  };

  it('takes the kept words and breaks as positions, and tidies the title to one line', () => {
    expect(sharedPoemFromEditor(dashed, snapshot)).toEqual({
      ok: true,
      poem: { passageId: 'dashed', keptPositions: [0, 3, 5, 6], breakAfterPositions: [3], erasureStyle: 'faded', title: 'Quiet Woods' },
    });
  });

  it('puts the words in order, whatever order they are listed in, and each break once', () => {
    const result = sharedPoemFromEditor(dashed, { ...snapshot, retainedTokenIds: [id(6), id(0), id(5), id(3)], lineBreaks: [id(5), id(3), id(3)] });
    expect(result.ok && result.poem.keptPositions).toEqual([0, 3, 5, 6]);
    expect(result.ok && result.poem.breakAfterPositions).toEqual([3, 5]);
  });

  it('leaves out a break after the last word, or after a word that is not kept', () => {
    const result = sharedPoemFromEditor(dashed, { ...snapshot, lineBreaks: [id(6), id(4), id(3)] });
    expect(result.ok && result.poem.breakAfterPositions).toEqual([3]);
  });

  it('cuts a title that is too long', () => {
    const result = sharedPoemFromEditor(dashed, { ...snapshot, title: 'x'.repeat(500) });
    expect(result.ok && result.poem.title).toHaveLength(MAX_SHARED_TITLE);
    expect(cleanSharedTitle(`${'y'.repeat(MAX_SHARED_TITLE - 1)} z`)).toBe('y'.repeat(MAX_SHARED_TITLE - 1));
  });

  it('refuses a poem with no words kept', () => {
    expect(sharedPoemFromEditor(dashed, { ...snapshot, retainedTokenIds: [], lineBreaks: [] })).toEqual({ ok: false, reason: 'empty', message: SHARE_EMPTY_MESSAGE });
  });

  it('refuses a poem of more than 300 words, and says what to do instead', () => {
    const long: Passage = { ...dashed, id: 'long', tokens: tokenize('long', Array.from({ length: 301 }, (_, i) => `w${i}`).join(' ')) };
    const ids = long.tokens.filter(t => t.isSelectable).map(t => t.id);
    expect(sharedPoemFromEditor(long, { ...snapshot, retainedTokenIds: ids.slice(0, MAX_SHARED_WORDS), lineBreaks: [] }).ok).toBe(true);
    expect(sharedPoemFromEditor(long, { ...snapshot, retainedTokenIds: ids, lineBreaks: [] })).toEqual({ ok: false, reason: 'too-long', message: SHARE_TOO_LONG_MESSAGE });
  });
});

describe('opening a shared poem against a passage', () => {
  it('keeps exactly the named words, breaks after the named ones, and takes the style and title, with no notes', () => {
    const result = resolveSharedPoem({ passageId: 'dashed', keptPositions: [0, 3, 5, 6], breakAfterPositions: [3], erasureStyle: 'whiteout', title: 'Quiet Woods' }, [dashed]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toEqual({
      retainedTokenIds: [id(0), id(3), id(5), id(6)],
      lineBreaks: [id(3)],
      erasureStyle: 'whiteout',
      title: 'Quiet Woods',
      notes: '',
    });
  });

  it('refuses a passage that is not in the library', () => {
    expect(resolveSharedPoem(poem(), [dashed])).toEqual({ ok: false, reason: 'passage-missing', message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE });
  });

  it.each([
    ['a position that is not in the passage', [0, 3, 99]],
    ['the em dash, which is not a word', [1, 2, 3]],
  ])('refuses %s, and repairs nothing', (_name, keptPositions) => {
    expect(resolveSharedPoem({ passageId: 'dashed', keptPositions, breakAfterPositions: [], erasureStyle: 'blackout', title: '' }, [dashed])).toEqual({
      ok: false,
      reason: 'token-mismatch',
      message: FOUND_HANDOFF_MISMATCH_MESSAGE,
    });
  });
});

describe('readHandoff with a shared poem', () => {
  it('opens it, and says it was shared', () => {
    const read = readHandoff('#poem=dashed:0,3,5,6:3:f:Quiet%20Woods', [dashed]);
    expect(read).toMatchObject({ kind: 'open', mode: 'shared', passage: { id: 'dashed' }, snapshot: { title: 'Quiet Woods', erasureStyle: 'faded' } });
  });

  it('still opens the other kinds of link', () => {
    expect(readHandoff('#assisted=dashed:0,3,5,6:3', [dashed])).toMatchObject({ kind: 'open', mode: 'assisted' });
    expect(readHandoff('#found=dashed:3-6:4', [dashed])).toMatchObject({ kind: 'open', mode: 'found' });
  });

  it('reports a link that is damaged, edited, or for a book that is gone', () => {
    expect(readHandoff('#poem=dashed:5,3::b:', [dashed])).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE });
    expect(readHandoff('#poem=dashed:0,99::b:', [dashed])).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_MISMATCH_MESSAGE });
    expect(readHandoff('#poem=other:0,3::b:', [dashed])).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE });
  });
});

describe('sharing a real poem and opening it', () => {
  it('comes back exactly as it was, title and style included', () => {
    const start = readHandoff('#found=walden-woods:14-28:16,23', bundledPassages);
    if (start.kind !== 'open') throw new Error('the starting link does not open');
    const edited = { ...start.snapshot, erasureStyle: 'faded' as const, title: 'Quiet Woods', notes: 'private' };

    const shared = sharedPoemFromEditor(start.passage, edited);
    if (!shared.ok) throw new Error('could not share');
    const href = sharedPoemHref(shared.poem);
    expect(href.length).toBeLessThan(120);

    const back = readHandoff(href.slice(href.indexOf('#')), bundledPassages);
    expect(back).toMatchObject({ kind: 'open', mode: 'shared' });
    if (back.kind !== 'open') return;
    expect(back.passage.id).toBe('walden-woods');
    expect(back.snapshot).toEqual({ ...edited, notes: '' }); // everything but the private notes
  });

  it('keeps a long poem of scattered words within a link of sensible length', () => {
    const walden = bundledPassages.find(p => p.id === 'walden-woods')!;
    const words = walden.tokens.filter(t => t.isSelectable);
    const every = (n: number) => words.filter((_, i) => i % n === 0).map(t => t.id);
    const shared = sharedPoemFromEditor(walden, { retainedTokenIds: every(2), lineBreaks: every(8), erasureStyle: 'blackout', title: 'A long one' });
    if (!shared.ok) throw new Error('could not share');
    expect(sharedPoemHref(shared.poem).length).toBeLessThan(2000);
  });
});
