import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MIN_OVERLAP,
  foundSearch,
  getFoundContext,
  groupFoundCandidates,
  summarizeFound,
  type FoundCandidate,
} from '@/lib/search/found';
import { tokenize } from '@/lib/tokenizer';
import type { SyllableResult } from '@/lib/syllables';

/**
 * A passage of `count` one-syllable words, w0 w1 w2 ... Every start position then yields exactly
 * one 17-word candidate (5 + 7 + 5), so a passage of N words has N - 16 candidates, the one that
 * starts at word i covering words i .. i + 16. That makes the expected grouping easy to work out
 * by hand: a candidate that started k words after another shares 17 - k words with it.
 */
function slidingPassage(count: number, passageId = 'p') {
  const words = Array.from({ length: count }, (_, i) => `w${i}`);
  const tokens = tokenize(passageId, words.join(' '));
  const syllables = new Map<string, SyllableResult>(
    tokens.map(t => [t.id, { word: t.word, count: 1, confidence: 'definite' }])
  );
  return { tokens, candidates: foundSearch(tokens, syllables, passageId) };
}

/** The word index each candidate starts at, e.g. "w12" -> 12. */
const startWord = (c: FoundCandidate) => Number(c.line1.tokens[0].word.slice(1));

describe('groupFoundCandidates', () => {
  it('has the premise the hand calculations rely on: one 17-word candidate per start', () => {
    const { candidates } = slidingPassage(30);
    expect(candidates).toHaveLength(14);
    expect(candidates.map(startWord)).toEqual([...Array(14).keys()]);
    expect(candidates.every(c => c.endPosition - c.startPosition === 16)).toBe(true);
  });

  it('groups windows that slid by up to 8 words and starts a new family at 9', () => {
    // 17 - k shared words > 8.5 only for k <= 8.
    const families = groupFoundCandidates(slidingPassage(30).candidates);
    expect(families.map(f => f.members.map(startWord))).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
      [9, 10, 11, 12, 13],
    ]);
    expect(families.map(f => startWord(f.representative))).toEqual([0, 9]);
    expect(families[0].members[0]).toBe(families[0].representative);
  });

  it('describes each family by where it starts and where its last member ends', () => {
    const [first, second] = groupFoundCandidates(slidingPassage(30).candidates);
    expect([first.startPosition, first.endPosition]).toEqual([0, 24]); // last member starts at w8
    expect([second.startPosition, second.endPosition]).toEqual([9, 29]);
    expect(first.id).toBe('p-family-0000');
    expect(second.id).toBe('p-family-0009');
  });

  it('compares with the representative only, so a chain of one-word shifts does not merge', () => {
    // 60 words -> 44 candidates (starts 0..43). Families start at 0, 9, 18, 27, 36.
    const families = groupFoundCandidates(slidingPassage(60).candidates);
    expect(families.map(f => startWord(f.representative))).toEqual([0, 9, 18, 27, 36]);
    expect(families.map(f => f.members.length)).toEqual([9, 9, 9, 9, 8]);
  });

  it('follows the overlap threshold', () => {
    const { candidates } = slidingPassage(30);
    expect(DEFAULT_MIN_OVERLAP).toBe(0.5);

    // Stricter: shared must exceed 90% of 17 = 15.3, i.e. 16 or more, so only k <= 1 joins.
    expect(groupFoundCandidates(candidates, 0.9).map(f => f.members.map(startWord))).toEqual([
      [0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13],
    ]);
    // Looser: any shared word at all (k <= 16) joins, so all 14 fall in one family.
    expect(groupFoundCandidates(candidates, 0).map(f => f.members.length)).toEqual([14]);
    // Impossible to exceed 100%: nothing joins.
    expect(groupFoundCandidates(candidates, 1)).toHaveLength(14);
  });

  it('puts every candidate in exactly one family and loses nothing', () => {
    const { candidates } = slidingPassage(45);
    const families = groupFoundCandidates(candidates);
    const grouped = families.flatMap(f => f.members);
    expect(grouped).toHaveLength(candidates.length);
    expect(new Set(grouped.map(c => c.id)).size).toBe(candidates.length);
    expect(grouped.every(c => candidates.includes(c))).toBe(true);
  });

  it('does not depend on input order and does not change its input', () => {
    const { candidates } = slidingPassage(40);
    const reversed = [...candidates].reverse();
    const snapshot = candidates.map(c => c.id);

    const a = groupFoundCandidates(candidates).map(f => f.members.map(startWord));
    const b = groupFoundCandidates(reversed).map(f => f.members.map(startWord));
    expect(b).toEqual(a);
    expect(candidates.map(c => c.id)).toEqual(snapshot);
    expect(reversed[0]).toBe(candidates[candidates.length - 1]);
  });

  it('returns nothing for nothing', () => {
    expect(groupFoundCandidates([])).toEqual([]);
  });

  it('keeps separate stretches of text in separate families', () => {
    // Two 17-word candidates with a gap between them overlap nowhere.
    const early = slidingPassage(17).candidates;
    const { candidates } = slidingPassage(60);
    const late = candidates.filter(c => startWord(c) === 40);
    const families = groupFoundCandidates([...early, ...late]);
    expect(families).toHaveLength(2);
  });
});

describe('summarizeFound', () => {
  it('reports raw and grouped counts and densities side by side', () => {
    const { candidates } = slidingPassage(30);
    expect(summarizeFound(candidates, 30)).toEqual({
      wordCount: 30,
      candidateCount: 14,
      familyCount: 2,
      candidatesPer100Words: 46.67,
      familiesPer100Words: 6.67,
    });
  });

  it('is all zeros for no candidates and survives an empty passage', () => {
    expect(summarizeFound([], 100)).toMatchObject({ candidateCount: 0, familyCount: 0, candidatesPer100Words: 0, familiesPer100Words: 0 });
    expect(summarizeFound([], 0)).toMatchObject({ candidatesPer100Words: 0, familiesPer100Words: 0 });
  });
});

describe('getFoundContext', () => {
  const { tokens, candidates } = slidingPassage(40);
  const at = (start: number) => candidates.find(c => startWord(c) === start)!;
  const words = (list: { word: string }[]) => list.map(t => t.word);

  it('returns the words on each side of the candidate, in reading order', () => {
    const { before, after } = getFoundContext(at(12), tokens, 5);
    expect(words(before)).toEqual(['w7', 'w8', 'w9', 'w10', 'w11']);
    expect(words(after)).toEqual(['w29', 'w30', 'w31', 'w32', 'w33']); // candidate covers w12..w28
  });

  it('joins up with the candidate without a gap or an overlap', () => {
    const c = at(12);
    const { before, after } = getFoundContext(c, tokens);
    expect(before[before.length - 1].position).toBe(c.startPosition - 1);
    expect(after[0].position).toBe(c.endPosition + 1);
  });

  it('uses 8 words each side by default', () => {
    const { before, after } = getFoundContext(at(12), tokens);
    expect(before).toHaveLength(8);
    expect(after).toHaveLength(8);
  });

  it('is shorter at the start and the end of the passage, and empty when there is nothing', () => {
    const first = getFoundContext(at(0), tokens, 5);
    expect(first.before).toEqual([]);
    expect(words(first.after)).toEqual(['w17', 'w18', 'w19', 'w20', 'w21']);

    const last = getFoundContext(at(23), tokens, 5); // covers w23..w39, the end of the passage
    expect(words(last.before)).toEqual(['w18', 'w19', 'w20', 'w21', 'w22']);
    expect(last.after).toEqual([]);

    const near = getFoundContext(at(21), tokens, 5);
    expect(words(near.after)).toEqual(['w38', 'w39']);
  });

  it('keeps em dashes in the context without counting them as words', () => {
    const dashed = tokenize('d', Array.from({ length: 20 }, (_, i) => (i === 2 ? 'w2—w2b' : `w${i}`)).join(' '));
    const syllables = new Map<string, SyllableResult>(
      dashed.map(t => [t.id, { word: t.word, count: 1, confidence: 'definite' }])
    );
    const found = foundSearch(dashed, syllables, 'd');
    const last = found[found.length - 1]; // starts after the dash
    const { before } = getFoundContext(last, dashed, 30);
    expect(before.map(t => t.text)).toContain('—');
    expect(before.filter(t => t.kind === 'word').length).toBe(before.length - 1);
  });

  it('returns empty context for a candidate that is not in the token list', () => {
    expect(getFoundContext(at(5), [], 5)).toEqual({ before: [], after: [] });
  });
});
