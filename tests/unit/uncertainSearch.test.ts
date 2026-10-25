import { describe, it, expect } from 'vitest';
import { analyzeFound, foundCandidateTokens, foundSearch, type FoundCandidate } from '@/lib/search/found';
import { assistedSearch } from '@/lib/search/assisted';
import { tokenize } from '@/lib/tokenizer';
import type { SyllableResult } from '@/lib/syllables';

/**
 * A passage of one-syllable words w0 w1 w2 ..., except for word 2, whose syllable count is given.
 * Every count that word may take is worked out by hand below.
 */
function passageWith(wordCount: number, special: SyllableResult, specialIndex = 2) {
  const tokens = tokenize('p', Array.from({ length: wordCount }, (_, i) => `w${i}`).join(' '));
  const words = tokens.filter(t => t.isSelectable && t.kind === 'word');
  const syllables = new Map<string, SyllableResult>(
    words.map((t, i) => [t.id, i === specialIndex ? { ...special, word: t.word } : { word: t.word, count: 1, confidence: 'definite' }])
  );
  const indexOf = new Map(words.map((t, i) => [t.id, i]));
  return { tokens, words, syllables, indexOf };
}

const ambiguous: SyllableResult = { word: '', count: null, confidence: 'ambiguous', counts: [1, 2] };
const estimated: SyllableResult = { word: '', count: 2, confidence: 'estimated', estimatedFrom: 'x' };
const unknown: SyllableResult = { word: '', count: null, confidence: 'unknown' };

/** Where a Found candidate starts and how many words it has. */
const shape = (c: FoundCandidate, indexOf: Map<string, number>) => {
  const words = foundCandidateTokens(c);
  return `${indexOf.get(words[0].id)}:${words.length}`;
};
const sums = (c: FoundCandidate) => [c.line1, c.line2, c.line3].map(l => l.syllableResults.reduce((s, r) => s + (r.count ?? 0), 0));

describe('Found search with an ambiguous word (1 or 2 syllables) at word 2 of 20', () => {
  const { tokens, syllables, indexOf } = passageWith(20, ambiguous);

  it('does not use the ambiguous word unless asked to: only the window after it is found', () => {
    const candidates = foundSearch(tokens, syllables, 'p');
    // Windows of 17 one-syllable words starting at 3 is the only one clear of word 2.
    expect(candidates.map(c => shape(c, indexOf))).toEqual(['3:17']);
    expect(candidates[0].hasUncertain).toBe(false);
  });

  it('with uncertainty allowed, tries both counts: every start up to 3, each as 17 words (word 2 = 1) and 16 (word 2 = 2)', () => {
    // start 0: 0..16 (17) and 0..15 (16)   start 1: 1..17 and 1..16   start 2: 2..18 and 2..17   start 3: 3..19
    const candidates = foundSearch(tokens, syllables, 'p', { allowUncertain: true });
    expect(candidates.map(c => shape(c, indexOf)).sort()).toEqual(['0:16', '0:17', '1:16', '1:17', '2:16', '2:17', '3:17']);
    expect(candidates.filter(c => c.hasUncertain)).toHaveLength(6);
    expect(candidates.filter(c => !c.hasUncertain)).toHaveLength(1);
  });

  it('records which count each poem relied on, and its lines add up to 5, 7 and 5 with it', () => {
    const candidates = foundSearch(tokens, syllables, 'p', { allowUncertain: true });
    for (const c of candidates) expect(sums(c)).toEqual([5, 7, 5]);

    const used = (c: FoundCandidate) =>
      [c.line1, c.line2, c.line3].flatMap(l => l.syllableResults).find(r => r.confidence === 'ambiguous');
    const byShape = (s: string) => candidates.find(c => shape(c, indexOf) === s)!;

    // Starting at word 0 with 17 words, word 2 counts 1; with 16 words it counts 2 (and line 1 has 4 words).
    expect(used(byShape('0:17'))).toMatchObject({ count: 1, counts: [1, 2], confidence: 'ambiguous' });
    expect(used(byShape('0:16'))).toMatchObject({ count: 2, counts: [1, 2], confidence: 'ambiguous' });
    expect(byShape('0:17').line1.tokens).toHaveLength(5);
    expect(byShape('0:16').line1.tokens).toHaveLength(4);
    expect(used(byShape('3:17'))).toBeUndefined();
  });

  it('flags a poem as uncertain only when it uses the word', () => {
    const candidates = foundSearch(tokens, syllables, 'p', { allowUncertain: true });
    for (const c of candidates) {
      const usesIt = foundCandidateTokens(c).some(t => indexOf.get(t.id) === 2);
      expect(c.hasUncertain).toBe(usesIt);
    }
  });

  it('finds the same poems as before when uncertainty is not allowed, however the option is spelled', () => {
    const base = foundSearch(tokens, syllables, 'p').map(c => c.id);
    expect(foundSearch(tokens, syllables, 'p', {}).map(c => c.id)).toEqual(base);
    expect(foundSearch(tokens, syllables, 'p', { allowUncertain: false }).map(c => c.id)).toEqual(base);
  });
});

describe('Found search with an estimated word (2 syllables) at word 2 of 20', () => {
  const { tokens, syllables, indexOf } = passageWith(20, estimated);

  it('is left out unless asked for, and then used with its one count', () => {
    expect(foundSearch(tokens, syllables, 'p').map(c => shape(c, indexOf))).toEqual(['3:17']);
    // Word 2 counts 2, so poems that use it have 16 words: starts 0, 1 and 2, plus start 3.
    const allowed = foundSearch(tokens, syllables, 'p', { allowUncertain: true });
    expect(allowed.map(c => shape(c, indexOf)).sort()).toEqual(['0:16', '1:16', '2:16', '3:17']);
    expect(allowed.filter(c => c.hasUncertain)).toHaveLength(3);
  });
});

describe('Found search with a word of no known count', () => {
  it('is never used, whether uncertainty is allowed or not', () => {
    const { tokens, syllables, indexOf } = passageWith(20, unknown);
    for (const allowUncertain of [false, true]) {
      expect(foundSearch(tokens, syllables, 'p', { allowUncertain }).map(c => shape(c, indexOf))).toEqual(['3:17']);
    }
  });
});

describe('analysing Found results that include uncertain poems', () => {
  const { tokens, syllables } = passageWith(20, ambiguous);
  const all = foundSearch(tokens, syllables, 'p', { allowUncertain: true });
  const analysis = analyzeFound(tokens, all);
  const definiteOnly = analyzeFound(tokens, foundSearch(tokens, syllables, 'p'));

  it('describes only the definite poems in the families, counts and Page DNA, exactly as without uncertainty', () => {
    expect(analysis.families.map(f => f.id)).toEqual(definiteOnly.families.map(f => f.id));
    expect(analysis.pageDna).toEqual(definiteOnly.pageDna);
    expect(analysis.totalCandidates).toBe(1);
    expect(analysis.hiddenByWeakEnding).toBe(definiteOnly.hiddenByWeakEnding);
    expect(analysis.pageDna.poemsToFind).toBe(1);
  });

  it('keeps the uncertain poems apart, grouped into their own families, none of them lost', () => {
    expect(analysis.uncertainCandidates).toBe(6);
    expect(analysis.uncertainFamilies.length).toBeGreaterThanOrEqual(1);
    const members = analysis.uncertainFamilies.flatMap(f => f.members);
    expect(members).toHaveLength(6);
    expect(members.every(c => c.hasUncertain)).toBe(true);
    expect(analysis.families.flatMap(f => f.members).some(c => c.hasUncertain)).toBe(false);
  });

  it('gives the uncertain families their own ids, so none shares an id with a definite family', () => {
    const definiteIds = new Set(analysis.families.map(f => f.id));
    for (const family of analysis.uncertainFamilies) {
      expect(family.id).toMatch(/^p-uncertain-\d{4}$/);
      expect(definiteIds.has(family.id)).toBe(false);
    }
  });

  it('has no uncertain families when there are no uncertain poems', () => {
    expect(definiteOnly.uncertainFamilies).toEqual([]);
    expect(definiteOnly.uncertainCandidates).toBe(0);
  });
});

describe('Assisted search with an ambiguous word (1 or 2 syllables) at word 20 of 60', () => {
  const { tokens, syllables, indexOf } = passageWith(60, ambiguous, 20);
  const everything = { limit: 9999, maxSharedWords: 1, maxSpanOverlap: 1 };
  const keeps = (c: { line1: { tokens: { id: string }[] }; line2: { tokens: { id: string }[] }; line3: { tokens: { id: string }[] } }) =>
    [c.line1, c.line2, c.line3].some(l => l.tokens.some(t => indexOf.get(t.id) === 20));

  it('never keeps the word unless asked to, and reports it as one it cannot use', () => {
    const { candidates, stats } = assistedSearch(tokens, syllables, 'p', everything);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(keeps)).toBe(false);
    expect(candidates.every(c => !c.hasUncertain)).toBe(true);
    expect(stats.wordsWithoutCount).toBe(1);
    expect(stats.uncertainWords).toBe(1);
  });

  it('with uncertainty allowed, keeps it in some poems, flagged, with the count the poem relied on', () => {
    const { candidates, stats } = assistedSearch(tokens, syllables, 'p', { ...everything, allowUncertain: true });
    expect(stats.wordsWithoutCount).toBe(0);
    expect(stats.uncertainWords).toBe(1);

    const using = candidates.filter(keeps);
    expect(using.length).toBeGreaterThan(0);
    expect(using.every(c => c.hasUncertain)).toBe(true);
    expect(candidates.filter(c => !keeps(c)).every(c => !c.hasUncertain)).toBe(true);

    const counts = new Set<number | null>();
    for (const c of using) {
      const result = [c.line1, c.line2, c.line3].flatMap(l => l.syllableResults).find(r => r.confidence === 'ambiguous')!;
      expect(result.counts).toEqual([1, 2]);
      counts.add(result.count);
    }
    expect([...counts].sort()).toEqual([1, 2]); // poems exist for each way of counting it
  });

  it('adds up to 5, 7 and 5 using the counts it relied on', () => {
    const { candidates } = assistedSearch(tokens, syllables, 'p', { ...everything, allowUncertain: true });
    for (const c of candidates) {
      expect([c.line1, c.line2, c.line3].map(l => l.syllableResults.reduce((s, r) => s + (r.count ?? 0), 0))).toEqual([5, 7, 5]);
    }
  });

  it('ranks a poem that relies on it 10 points below the same poem without it', () => {
    // All one-syllable content words, no skips: a definite poem scores 3 x 20 = 60. A line with the
    // uncertain word loses 10, so the best poem that relies on it scores 50.
    const { candidates } = assistedSearch(tokens, syllables, 'p', { ...everything, allowUncertain: true });
    const best = (list: typeof candidates) => Math.max(...list.map(c => c.score));
    expect(best(candidates.filter(c => !c.hasUncertain))).toBe(60);
    expect(best(candidates.filter(c => c.hasUncertain))).toBe(50);
    expect(candidates[0].hasUncertain).toBe(false);
  });
});
