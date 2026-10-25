import { describe, it, expect, beforeAll } from 'vitest';
import {
  FOUND_HANDOFF_INVALID_MESSAGE,
  FOUND_HANDOFF_MISMATCH_MESSAGE,
  FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE,
  assistedHandoffFromCandidate,
  assistedHandoffHref,
  decodeAssistedHandoff,
  encodeAssistedHandoff,
  readHandoff,
  resolveAssistedHandoff,
  type AssistedHandoff,
} from '@/lib/handoff';
import { bundledPassages } from '@/lib/library/bundled';
import { assistedSearch, type AssistedCandidate } from '@/lib/search/assisted';
import { getSyllableMap, lookupWord } from '@/lib/syllables';
import { tokenize } from '@/lib/tokenizer';
import type { Passage } from '@/lib/models';

const handoff = (overrides: Partial<AssistedHandoff> = {}): AssistedHandoff => ({
  passageId: 'walden-woods',
  keptPositions: [14, 15, 16, 20, 23, 24, 25],
  breakAfterPositions: [16, 20],
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

describe('encoding an Assisted hand-off', () => {
  it('lists the kept words, writing runs of three or more as first-last, and the line breaks', () => {
    expect(encodeAssistedHandoff(handoff())).toBe('assisted=walden-woods:14-16,20,23-25:16,20');
    expect(assistedHandoffHref(handoff())).toBe('/studio#assisted=walden-woods:14-16,20,23-25:16,20');
    expect(assistedHandoffHref(handoff(), '/x')).toBe('/x#assisted=walden-woods:14-16,20,23-25:16,20');
  });

  it('writes a run of two as two words, a lone word as itself, and no breaks as nothing', () => {
    expect(encodeAssistedHandoff(handoff({ keptPositions: [4, 5, 9], breakAfterPositions: [] }))).toBe('assisted=walden-woods:4,5,9:');
    expect(encodeAssistedHandoff(handoff({ keptPositions: [3], breakAfterPositions: [] }))).toBe('assisted=walden-woods:3:');
    expect(encodeAssistedHandoff(handoff({ keptPositions: [1, 2, 3, 4], breakAfterPositions: [] }))).toBe('assisted=walden-woods:1-4:');
  });
});

describe('decoding an Assisted hand-off', () => {
  it('reads a well-formed hash, with or without the #, and expands the runs', () => {
    const expected = handoff();
    expect(decodeAssistedHandoff('assisted=walden-woods:14-16,20,23-25:16,20')).toEqual(expected);
    expect(decodeAssistedHandoff('#assisted=walden-woods:14-16,20,23-25:16,20')).toEqual(expected);
    expect(decodeAssistedHandoff('assisted=p:3:')).toEqual({ passageId: 'p', keptPositions: [3], breakAfterPositions: [] });
  });

  it('accepts a run of any length, not only the form this app writes', () => {
    expect(decodeAssistedHandoff('assisted=p:4-5,9:4')?.keptPositions).toEqual([4, 5, 9]);
    expect(decodeAssistedHandoff('assisted=p:7-7:')?.keptPositions).toEqual([7]);
  });

  it('allows 40 kept words and no more', () => {
    expect(decodeAssistedHandoff('assisted=p:0-39:')?.keptPositions).toHaveLength(40);
    expect(decodeAssistedHandoff('assisted=p:0-40:')).toBeNull();
    expect(decodeAssistedHandoff(`assisted=p:${Array.from({ length: 41 }, (_, i) => i * 2).join(',')}:`)).toBeNull();
    expect(decodeAssistedHandoff('assisted=p:0-999999:')).toBeNull(); // refused without being expanded
  });

  it.each([
    ['empty', ''],
    ['only a #', '#'],
    ['the Found key', 'found=walden-woods:14-28:16,23'],
    ['another key', 'poem=walden-woods:1,2:1'],
    ['no passage', 'assisted=:1,2:1'],
    ['upper-case passage', 'assisted=Walden:1,2:1'],
    ['path characters in the passage', 'assisted=../etc:1,2:1'],
    ['an encoded passage', 'assisted=%3Cscript%3E:1,2:1'],
    ['missing the breaks part', 'assisted=walden-woods:1,2,3'],
    ['no kept words', 'assisted=walden-woods::'],
    ['non-numeric words', 'assisted=walden-woods:a,b:'],
    ['negative words', 'assisted=walden-woods:-1,2:'],
    ['decimals', 'assisted=walden-woods:1.5,2:'],
    ['words out of order', 'assisted=walden-woods:5,3:'],
    ['a repeated word', 'assisted=walden-woods:3,3:'],
    ['overlapping runs', 'assisted=walden-woods:3-5,5:'],
    ['a reversed run', 'assisted=walden-woods:5-3:'],
    ['an open-ended run', 'assisted=walden-woods:3-:'],
    ['a break after a word that is not kept', 'assisted=walden-woods:3,5:4'],
    ['a break at the last kept word', 'assisted=walden-woods:3,5:5'],
    ['breaks out of order', 'assisted=walden-woods:1,3,5:3,1'],
    ['a repeated break', 'assisted=walden-woods:1,3,5:1,1'],
    ['trailing text', 'assisted=walden-woods:1,2:1&x=1'],
    ['a trailing comma', 'assisted=walden-woods:1,2,:1'],
    ['spaces', 'assisted=walden-woods:1, 2:1'],
    ['a position of seven digits', 'assisted=walden-woods:1,1234567:1'],
    ['more than 50 breaks', `assisted=p:0-39:${Array.from({ length: 51 }, (_, i) => i).join(',')}`],
  ])('refuses %s', (_name, hash) => {
    expect(decodeAssistedHandoff(hash)).toBeNull();
  });

  it('round-trips whatever it encodes', () => {
    for (const h of [
      handoff(),
      handoff({ keptPositions: [0, 2, 4], breakAfterPositions: [] }),
      handoff({ keptPositions: Array.from({ length: 40 }, (_, i) => i), breakAfterPositions: [5, 20] }),
    ]) {
      expect(decodeAssistedHandoff(encodeAssistedHandoff(h))).toEqual(h);
    }
  });
});

describe('resolving an Assisted hand-off against a passage', () => {
  it('keeps exactly the named words, so the words between them are erased, and breaks after the named ones', () => {
    // alpha(0), gamma(3), epsilon(5), zeta(6); break after gamma.
    const result = resolveAssistedHandoff({ passageId: 'dashed', keptPositions: [0, 3, 5, 6], breakAfterPositions: [3] }, [dashed]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.retainedTokenIds).toEqual(['dashed-token-0000', 'dashed-token-0003', 'dashed-token-0005', 'dashed-token-0006']);
    expect(result.snapshot.lineBreaks).toEqual(['dashed-token-0003']);
    expect(result.snapshot).toMatchObject({ erasureStyle: 'blackout', title: '', notes: '' });
  });

  it('refuses a passage that is not in the library', () => {
    expect(resolveAssistedHandoff(handoff(), [dashed])).toEqual({
      ok: false,
      reason: 'passage-missing',
      message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE,
    });
  });

  it.each([
    ['a position that is not in the passage', [0, 3, 99]],
    ['the em dash, which is not a word', [1, 2, 3]],
  ])('refuses %s, and repairs nothing', (_name, keptPositions) => {
    expect(resolveAssistedHandoff({ passageId: 'dashed', keptPositions, breakAfterPositions: [] }, [dashed])).toEqual({
      ok: false,
      reason: 'token-mismatch',
      message: FOUND_HANDOFF_MISMATCH_MESSAGE,
    });
  });
});

describe('readHandoff, for either kind of link', () => {
  const passages = [dashed];

  it('opens an Assisted link, and says it came from the Assisted page', () => {
    const read = readHandoff('#assisted=dashed:0,3,5,6:3', passages);
    expect(read).toMatchObject({ kind: 'open', mode: 'assisted', passage: { id: 'dashed' } });
  });

  it('opens a Found link as before, and says it was found', () => {
    expect(readHandoff('#found=dashed:3-6:4', passages)).toMatchObject({ kind: 'open', mode: 'found' });
  });

  it('leaves other hashes alone', () => {
    for (const hash of ['', '#', '#main', '#passage=dashed']) expect(readHandoff(hash, passages)).toEqual({ kind: 'none' });
  });

  it('reports a link that claims to be a hand-off but is not usable', () => {
    expect(readHandoff('#assisted=dashed:5,3:', passages)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE });
    expect(readHandoff('#assisted=dashed:0,99:', passages)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_MISMATCH_MESSAGE });
    expect(readHandoff('#assisted=other:0,3:', passages)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE });
  });
});

// The links the browser tests (e2e/handoff.spec.ts) open. Each is checked here against the library,
// so it opens the poem written next to it.
describe('the links the browser tests use', () => {
  it.each([
    ['assisted=walden-woods:53-55,57,61,63,64,68,69:57,64', ['life, living is dear;', 'wish practise resignation,', 'quite necessary.']],
    ['assisted=jane-eyre-ch1:49,51,55,57,58,61,68-71:51,61', ['rain penetrating,', 'exercise now out question.', 'never liked long walks,']],
  ])('%s', (hash, lines) => {
    const read = readHandoff(`#${hash}`, bundledPassages);
    expect(read.kind).toBe('open');
    if (read.kind !== 'open') return;
    const textOf = new Map(read.passage.tokens.map(t => [t.id, t.text]));
    const breaks = new Set(read.snapshot.lineBreaks);
    const written: string[] = [];
    let current: string[] = [];
    for (const id of read.snapshot.retainedTokenIds) {
      current.push(textOf.get(id)!);
      if (breaks.has(id)) { written.push(current.join(' ')); current = []; }
    }
    written.push(current.join(' '));
    expect(written).toEqual(lines);
  });
});

describe('a real Assisted poem handed to the Studio', () => {
  let candidates: AssistedCandidate[] = [];
  const walden = bundledPassages.find(p => p.id === 'walden-woods')!;

  beforeAll(async () => {
    const dictionary = await getSyllableMap();
    const syllables = new Map(walden.tokens.filter(t => t.isSelectable).map(t => [t.id, lookupWord(t.word, dictionary)]));
    candidates = assistedSearch(walden.tokens, syllables, walden.id, { limit: 20 }).candidates;
  });

  it('arrives as exactly the words and line breaks of the poem, for every poem', () => {
    expect(candidates.length).toBeGreaterThanOrEqual(6);
    for (const candidate of candidates) {
      const href = assistedHandoffHref(assistedHandoffFromCandidate(candidate));
      const read = readHandoff(href.slice(href.indexOf('#')), bundledPassages);
      expect(read.kind).toBe('open');
      if (read.kind !== 'open') continue;

      const byId = new Map(read.passage.tokens.map(t => [t.id, t.text]));
      const lines = [candidate.line1, candidate.line2, candidate.line3];
      expect(read.passage.id).toBe(candidate.passageId);
      expect(read.snapshot.retainedTokenIds).toEqual(lines.flatMap(l => l.tokens.map(t => t.id)));
      expect(read.snapshot.retainedTokenIds.map(id => byId.get(id))).toEqual(lines.flatMap(l => l.tokens.map(t => t.text)));
      expect(read.snapshot.lineBreaks).toEqual([candidate.line1, candidate.line2].map(l => l.tokens[l.tokens.length - 1].id));
    }
  });

  it('fits in a short link', () => {
    for (const candidate of candidates) {
      expect(assistedHandoffHref(assistedHandoffFromCandidate(candidate)).length).toBeLessThan(160);
    }
  });
});
