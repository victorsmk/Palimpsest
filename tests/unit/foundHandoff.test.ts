import { describe, it, expect, beforeAll } from 'vitest';
import {
  FOUND_HANDOFF_INVALID_MESSAGE,
  FOUND_HANDOFF_MISMATCH_MESSAGE,
  FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE,
  decodeFoundHandoff,
  encodeFoundHandoff,
  foundHandoffFromCandidate,
  foundHandoffHref,
  readFoundHandoff,
  resolveFoundHandoff,
  type FoundHandoff,
} from '@/lib/handoff';
import { bundledPassages } from '@/lib/library/bundled';
import { getSyllableMap, lookupWord } from '@/lib/syllables';
import { analyzeFound, foundSearch, type FoundCandidate } from '@/lib/search/found';
import { tokenize } from '@/lib/tokenizer';
import type { Passage } from '@/lib/models';

const handoff = (overrides: Partial<FoundHandoff> = {}): FoundHandoff => ({
  passageId: 'walden-woods',
  startPosition: 14,
  endPosition: 28,
  breakAfterPositions: [16, 23],
  ...overrides,
});

/** A passage with an em dash inside: alpha(0) beta(1) —(2) gamma(3) delta(4) epsilon(5) zeta(6). */
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

describe('encoding a hand-off', () => {
  it('writes the passage, the first and last token, and where the line breaks fall', () => {
    expect(encodeFoundHandoff(handoff())).toBe('found=walden-woods:14-28:16,23');
    expect(foundHandoffHref(handoff())).toBe('/studio#found=walden-woods:14-28:16,23');
    expect(foundHandoffHref(handoff(), '/somewhere')).toBe('/somewhere#found=walden-woods:14-28:16,23');
    expect(encodeFoundHandoff(handoff({ breakAfterPositions: [] }))).toBe('found=walden-woods:14-28:');
  });
});

describe('decoding a hand-off', () => {
  it('reads a well-formed hash, with or without the #', () => {
    expect(decodeFoundHandoff('found=walden-woods:14-28:16,23')).toEqual(handoff());
    expect(decodeFoundHandoff('#found=walden-woods:14-28:16,23')).toEqual(handoff());
    expect(decodeFoundHandoff('found=walden-woods:14-28:')).toEqual(handoff({ breakAfterPositions: [] }));
    expect(decodeFoundHandoff('found=p1:3-3:')).toEqual({ passageId: 'p1', startPosition: 3, endPosition: 3, breakAfterPositions: [] });
  });

  it.each([
    ['empty', ''],
    ['only a #', '#'],
    ['another key', 'poem=walden-woods:14-28:16,23'],
    ['no passage', 'found=:14-28:16,23'],
    ['upper-case passage', 'found=Walden:14-28:16,23'],
    ['path characters in the passage', 'found=../etc:14-28:16,23'],
    ['an encoded or script-like passage', 'found=%3Cscript%3E:14-28:16,23'],
    ['missing the breaks part', 'found=walden-woods:14-28'],
    ['a range with no end', 'found=walden-woods:14:16,23'],
    ['non-numeric positions', 'found=walden-woods:a-b:1,2'],
    ['negative positions', 'found=walden-woods:-3-28:16'],
    ['decimals', 'found=walden-woods:14.5-28:16'],
    ['a first position after the last', 'found=walden-woods:28-14:16,23'],
    ['a break before the start', 'found=walden-woods:14-28:13,23'],
    ['a break at the last word', 'found=walden-woods:14-28:16,28'],
    ['a break beyond the end', 'found=walden-woods:14-28:16,29'],
    ['breaks out of order', 'found=walden-woods:14-28:23,16'],
    ['a repeated break', 'found=walden-woods:14-28:16,16'],
    ['trailing text', 'found=walden-woods:14-28:16,23&x=1'],
    ['a trailing comma', 'found=walden-woods:14-28:16,23,'],
    ['spaces', 'found=walden-woods: 14-28:16,23'],
    ['a position of seven digits', 'found=walden-woods:1-1234567:3'],
    ['more than 50 breaks', `found=p:0-99999:${Array.from({ length: 51 }, (_, i) => i).join(',')}`],
  ])('refuses %s', (_name, hash) => {
    expect(decodeFoundHandoff(hash)).toBeNull();
  });

  it('round-trips whatever it encodes', () => {
    for (const h of [handoff(), handoff({ breakAfterPositions: [] }), handoff({ startPosition: 0, endPosition: 1, breakAfterPositions: [0] })]) {
      expect(decodeFoundHandoff(encodeFoundHandoff(h))).toEqual(h);
    }
  });
});

describe('resolving a hand-off against a passage', () => {
  it('keeps the words in the range, leaves out the em dash, and breaks after the named words', () => {
    // beta(1) through epsilon(5); the dash (2) is in the range but is not a word.
    const result = resolveFoundHandoff(
      { passageId: 'dashed', startPosition: 1, endPosition: 5, breakAfterPositions: [3] },
      [dashed]
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.snapshot.retainedTokenIds).toEqual([
      'dashed-token-0001', 'dashed-token-0003', 'dashed-token-0004', 'dashed-token-0005',
    ]);
    expect(result.snapshot.lineBreaks).toEqual(['dashed-token-0003']);
    expect(result.snapshot).toMatchObject({ erasureStyle: 'blackout', title: '', notes: '' });
  });

  it('can be a single word with no breaks', () => {
    const result = resolveFoundHandoff({ passageId: 'dashed', startPosition: 3, endPosition: 3, breakAfterPositions: [] }, [dashed]);
    expect(result.ok && result.snapshot.retainedTokenIds).toEqual(['dashed-token-0003']);
  });

  it('refuses a passage that is not in the library', () => {
    expect(resolveFoundHandoff(handoff(), [dashed])).toEqual({
      ok: false,
      reason: 'passage-missing',
      message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE,
    });
  });

  it.each([
    ['starts on an em dash', { startPosition: 2, endPosition: 5, breakAfterPositions: [3] }],
    ['ends on an em dash', { startPosition: 0, endPosition: 2, breakAfterPositions: [0] }],
    ['starts beyond the passage', { startPosition: 40, endPosition: 50, breakAfterPositions: [] }],
    ['ends beyond the passage', { startPosition: 3, endPosition: 50, breakAfterPositions: [] }],
    ['breaks after an em dash', { startPosition: 1, endPosition: 5, breakAfterPositions: [2] }],
    ['breaks after a token that does not exist', { startPosition: 1, endPosition: 5, breakAfterPositions: [4, 4000] }],
  ])('refuses a hand-off that %s', (_name, range) => {
    expect(resolveFoundHandoff({ passageId: 'dashed', ...range }, [dashed])).toEqual({
      ok: false,
      reason: 'token-mismatch',
      message: FOUND_HANDOFF_MISMATCH_MESSAGE,
    });
  });
});

describe('readFoundHandoff', () => {
  const passages = [dashed];

  it('leaves alone any hash that is not a hand-off', () => {
    for (const hash of ['', '#', '#section-2', '#foundation', '#found', 'found']) {
      expect(readFoundHandoff(hash, passages), hash).toEqual({ kind: 'none' });
    }
  });

  it('reports a hand-off it cannot use, with the reason', () => {
    expect(readFoundHandoff('#found=', passages)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE });
    expect(readFoundHandoff('#found=dashed:5-1:', passages)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE });
    expect(readFoundHandoff('#found=nope:1-5:3', passages)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE });
    expect(readFoundHandoff('#found=dashed:2-5:3', passages)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_MISMATCH_MESSAGE });
  });

  it('opens a good one', () => {
    const result = readFoundHandoff('#found=dashed:1-5:3', passages);
    expect(result).toMatchObject({ kind: 'open', passage: { id: 'dashed' } });
  });
});

describe('hand-offs for the real passages', () => {
  const candidates = new Map<string, FoundCandidate[]>();
  beforeAll(async () => {
    const dictionary = await getSyllableMap();
    for (const passage of bundledPassages) {
      const words = passage.tokens.filter(t => t.isSelectable && t.kind === 'word');
      const syllables = new Map(words.map(t => [t.id, lookupWord(t.word, dictionary)]));
      candidates.set(passage.id, foundSearch(passage.tokens, syllables, passage.id));
    }
  });

  const linesOf = (c: FoundCandidate) => [c.line1, c.line2, c.line3].map(l => l.tokens.map(t => t.text).join(' '));

  it.each(bundledPassages.map(p => p.id))(
    'opens every candidate of %s with exactly its words and its three lines',
    id => {
      const passage = bundledPassages.find(p => p.id === id)!;
      const all = candidates.get(id)!;
      expect(all.length).toBeGreaterThan(20);

      for (const candidate of all) {
        const original = foundHandoffFromCandidate(candidate);
        expect(decodeFoundHandoff(encodeFoundHandoff(original))).toEqual(original);

        const result = resolveFoundHandoff(original, bundledPassages);
        expect(result.ok, linesOf(candidate).join(' / ')).toBe(true);
        if (!result.ok) continue;
        expect(result.passage).toBe(passage);

        // The same words, in order.
        const expectedIds = [...candidate.line1.tokens, ...candidate.line2.tokens, ...candidate.line3.tokens].map(t => t.id);
        expect(result.snapshot.retainedTokenIds).toEqual(expectedIds);

        // Rebuilding the lines from the snapshot (a break ends a line) gives the candidate's lines.
        const breaks = new Set(result.snapshot.lineBreaks);
        const byId = new Map(passage.tokens.map(t => [t.id, t]));
        const rebuilt: string[] = [];
        let current: string[] = [];
        for (const tokenId of result.snapshot.retainedTokenIds) {
          current.push(byId.get(tokenId)!.text);
          if (breaks.has(tokenId)) {
            rebuilt.push(current.join(' '));
            current = [];
          }
        }
        rebuilt.push(current.join(' '));
        expect(rebuilt).toEqual(linesOf(candidate));
      }
    }
  );

  it('uses these exact links in the browser tests, which therefore open the poems they claim to', () => {
    const links: [string, string[]][] = [
      ['found=walden-woods:14-28:16,23', ['the essential facts', 'of life, and see if I could', 'not learn what it had']],
      ['found=walden-woods:24-38:28,35', ['not learn what it had', 'to teach, and not, when I came', 'to die, discover']],
      ['found=jane-eyre-ch1:54-66:55,61', ['outdoor exercise', 'was now out of the question.', 'I was glad of it:']],
      ['found=dorian-gray-ch1:2-15:6,11', ['was filled with the rich', 'odour of roses, and when', 'the light summer wind']],
    ];
    for (const [hash, lines] of links) {
      const read = readFoundHandoff(hash, bundledPassages);
      expect(read.kind, hash).toBe('open');
      if (read.kind !== 'open') continue;
      const byId = new Map(read.passage.tokens.map(t => [t.id, t.text]));
      const breaks = new Set(read.snapshot.lineBreaks);
      const rebuilt: string[] = [];
      let current: string[] = [];
      for (const tokenId of read.snapshot.retainedTokenIds) {
        current.push(byId.get(tokenId)!);
        if (breaks.has(tokenId)) {
          rebuilt.push(current.join(' '));
          current = [];
        }
      }
      rebuilt.push(current.join(' '));
      expect(rebuilt, hash).toEqual(lines);
    }
  });

  it('is the poem the Discover list will show first for Walden', () => {
    const passage = bundledPassages.find(p => p.id === 'walden-woods')!;
    const analysis = analyzeFound(passage.tokens, candidates.get('walden-woods')!);
    expect(encodeFoundHandoff(foundHandoffFromCandidate(analysis.families[0].representative))).toBe(
      'found=walden-woods:14-28:16,23'
    );
  });
});
