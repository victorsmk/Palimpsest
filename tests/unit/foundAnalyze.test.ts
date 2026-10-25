import { describe, it, expect } from 'vitest';
import {
  analyzeFound,
  groupFoundCandidates,
  hasWeakEnding,
  selectFoundFamilies,
  weakEndingLines,
  type FoundCandidate,
} from '@/lib/search/found';
import { endsOnWeakWord, WEAK_LINE_ENDINGS } from '@/lib/search/lineEndings';
import { tokenize } from '@/lib/tokenizer';
import { slidingPassage } from '../helpers/found';

/** The word index each candidate starts at (words are w0, w1, ...; "the" replaces some). */
const startIndexIn = (tokens: ReturnType<typeof tokenize>) => {
  const words = tokens.filter(t => t.kind === 'word');
  return (c: FoundCandidate) => words.findIndex(t => t.id === c.line1.tokens[0].id);
};

describe('weak line endings', () => {
  it('is the list the Assisted search uses, as one shared set', () => {
    for (const word of ['the', 'of', 'and', 'to', 'was', 'that', 'my', 'his']) {
      expect(WEAK_LINE_ENDINGS.has(word), word).toBe(true);
    }
    for (const word of ['wind', 'life', 'not', 'discover', 'dear']) {
      expect(WEAK_LINE_ENDINGS.has(word), word).toBe(false);
    }
  });

  it('looks at the last word of a line, ignoring case and punctuation', () => {
    const [line] = [tokenize('t', 'Where the sea meets The').filter(t => t.kind === 'word')];
    expect(endsOnWeakWord(line)).toBe(true); // "The" -> "the"
    expect(endsOnWeakWord(line.slice(0, 2))).toBe(true); // "Where the"
    expect(endsOnWeakWord(line.slice(0, 3))).toBe(false); // "Where the sea"
    expect(endsOnWeakWord(tokenize('t', 'of life,').filter(t => t.kind === 'word'))).toBe(false);
    expect(endsOnWeakWord([])).toBe(false);
  });

  it('reports which of a candidate\'s three lines end on a weak word', () => {
    // A candidate starting at word s ends its lines at words s+4, s+11 and s+16.
    const { candidates, tokens } = slidingPassage(30, 'p', [4, 11, 20]);
    const at = startIndexIn(tokens);
    const lines = (s: number) => weakEndingLines(candidates.find(c => at(c) === s)!);

    expect(lines(0)).toEqual([1, 2]); // ends at words 4 and 11
    expect(lines(7)).toEqual([1]); // ends at 11, 18, 23
    expect(lines(4)).toEqual([3]); // ends at 8, 15, 20
    expect(lines(9)).toEqual([2]); // ends at 13, 20, 25
    expect(lines(2)).toEqual([]);
    expect(hasWeakEnding(candidates.find(c => at(c) === 0)!)).toBe(true);
    expect(hasWeakEnding(candidates.find(c => at(c) === 2)!)).toBe(false);
  });
});

describe('selectFoundFamilies', () => {
  it('filters first and groups afterwards: the representative is the first survivor', () => {
    // "the" at word 4 puts a weak ending on line 1 of the candidate starting at word 0, and only
    // that one. Survivors start at 1..13. Rep 1 takes starts 1..9 (17-8 = 9 shared > 8.5); rep 10 takes 10..13.
    const { candidates, tokens } = slidingPassage(30, 'p', [4]);
    const at = startIndexIn(tokens);
    const families = selectFoundFamilies(candidates);

    expect(families.map(f => f.members.map(at))).toEqual([
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13],
    ]);
    expect(families.map(f => at(f.representative))).toEqual([1, 10]);

    // Grouping first would have drawn the lines elsewhere and shown the weak candidate 0.
    const groupedFirst = groupFoundCandidates(candidates);
    expect(groupedFirst.map(f => f.members.map(at))).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
      [9, 10, 11, 12, 13],
    ]);
    expect(at(groupedFirst[0].representative)).toBe(0);
  });

  it('removes weak endings on any line, and the gaps they leave move the family boundaries', () => {
    // "the" at word 20: start 9 ends line 2 there, start 4 ends line 3 there. Both disappear.
    const { candidates, tokens } = slidingPassage(30, 'p', [20]);
    const at = startIndexIn(tokens);
    expect(selectFoundFamilies(candidates).map(f => f.members.map(at))).toEqual([
      [0, 1, 2, 3, 5, 6, 7, 8],
      [10, 11, 12, 13],
    ]);
  });

  it('can include weak endings when asked, which is plain grouping', () => {
    const { candidates } = slidingPassage(30, 'p', [4]);
    const everything = selectFoundFamilies(candidates, { excludeWeakEndings: false });
    expect(everything.map(f => f.members.length)).toEqual(groupFoundCandidates(candidates).map(f => f.members.length));
    expect(everything.flatMap(f => f.members)).toHaveLength(candidates.length);
  });

  it('passes the overlap threshold through', () => {
    const { candidates } = slidingPassage(30, 'p', [4]);
    // Stricter: only k <= 1 joins. Survivors 1..13 -> [1,2] [3,4] ... [11,12] [13].
    expect(selectFoundFamilies(candidates, { minOverlap: 0.9 })).toHaveLength(7);
  });

  it('does not change its input or depend on its order', () => {
    const { candidates, tokens } = slidingPassage(30, 'p', [4]);
    const at = startIndexIn(tokens);
    const before = candidates.map(c => c.id);
    const shuffled = [...candidates].reverse();
    expect(selectFoundFamilies(shuffled).map(f => f.members.map(at))).toEqual(
      selectFoundFamilies(candidates).map(f => f.members.map(at))
    );
    expect(candidates.map(c => c.id)).toEqual(before);
  });
});

describe('analyzeFound / Page DNA', () => {
  it('counts the shown families as the poems to find, and says how dense they are', () => {
    const { tokens, candidates } = slidingPassage(30, 'p', [4]);
    const analysis = analyzeFound(tokens, candidates);

    expect(analysis.wordCount).toBe(30);
    expect(analysis.totalCandidates).toBe(14);
    expect(analysis.hiddenByWeakEnding).toBe(1);
    expect(analysis.families).toHaveLength(2);
    expect(analysis.pageDna).toMatchObject({
      poemsToFind: 2,
      per100Words: 6.67, // 2 / 30 * 100
      wordsPerPoem: 15, // 30 / 2
    });
  });

  it('describes each poem as a block of the passage, ready to draw as a strip', () => {
    const { tokens, candidates } = slidingPassage(30, 'p', [4]);
    const { blocks } = analyzeFound(tokens, candidates).pageDna;

    // Representatives start at words 1 and 10 and run 17 words (w1..w17 and w10..w26).
    expect(blocks).toEqual([
      { familyId: 'p-family-0001', startWord: 1, endWord: 17, startFraction: 1 / 30, endFraction: 18 / 30, variants: 8 },
      { familyId: 'p-family-0010', startWord: 10, endWord: 26, startFraction: 10 / 30, endFraction: 27 / 30, variants: 3 },
    ]);
  });

  it('keeps every block inside the strip, in reading order', () => {
    const { tokens, candidates } = slidingPassage(80, 'p', [9, 31, 52]);
    const { blocks } = analyzeFound(tokens, candidates).pageDna;
    expect(blocks.length).toBeGreaterThan(2);
    blocks.forEach((b, i) => {
      expect(b.startFraction).toBeGreaterThanOrEqual(0);
      expect(b.endFraction).toBeLessThanOrEqual(1);
      expect(b.startFraction).toBeLessThan(b.endFraction);
      if (i > 0) expect(b.startFraction).toBeGreaterThan(blocks[i - 1].startFraction);
    });
  });

  it('matches the families it returns, one block each, with their variant counts', () => {
    const { tokens, candidates } = slidingPassage(60, 'p', [4, 40]);
    const { families, pageDna } = analyzeFound(tokens, candidates);
    expect(pageDna.blocks.map(b => b.familyId)).toEqual(families.map(f => f.id));
    expect(pageDna.blocks.map(b => b.variants)).toEqual(families.map(f => f.members.length - 1));
    expect(pageDna.poemsToFind).toBe(families.length);
  });

  it('reports nothing to find without dividing by zero', () => {
    const empty = analyzeFound([], []);
    expect(empty).toMatchObject({ wordCount: 0, hiddenByWeakEnding: 0, totalCandidates: 0, families: [] });
    expect(empty.pageDna).toEqual({ poemsToFind: 0, per100Words: 0, wordsPerPoem: null, blocks: [] });

    const noCandidates = analyzeFound(slidingPassage(10).tokens, []);
    expect(noCandidates.pageDna).toEqual({ poemsToFind: 0, per100Words: 0, wordsPerPoem: null, blocks: [] });
  });

  it('can find candidates and still have none to show when every one ends on a weak word', () => {
    // 17 words with "the" at 4, 11 and 16: the single candidate ends all three lines on "the".
    const { tokens, candidates } = slidingPassage(17, 'p', [4, 11, 16]);
    expect(candidates).toHaveLength(1);
    const analysis = analyzeFound(tokens, candidates);
    expect(analysis.totalCandidates).toBe(1);
    expect(analysis.hiddenByWeakEnding).toBe(1);
    expect(analysis.pageDna).toEqual({ poemsToFind: 0, per100Words: 0, wordsPerPoem: null, blocks: [] });
  });

  it('reports hidden candidates as zero when weak endings are not excluded', () => {
    const { tokens, candidates } = slidingPassage(30, 'p', [4]);
    const all = analyzeFound(tokens, candidates, { excludeWeakEndings: false });
    expect(all.hiddenByWeakEnding).toBe(0);
    expect(all.families.flatMap(f => f.members)).toHaveLength(14);
  });

  it('rounds "about one every N words" to a whole number', () => {
    // 30 words, 2 poems -> 15; a 40-word passage with 3 families would give 13.33 -> 13.
    const { tokens, candidates } = slidingPassage(40);
    const analysis = analyzeFound(tokens, candidates);
    expect(analysis.pageDna.poemsToFind).toBe(3); // starts 0..23 -> families at 0, 9, 18
    expect(analysis.pageDna.wordsPerPoem).toBe(13); // 40 / 3 = 13.33
    expect(analysis.pageDna.per100Words).toBe(7.5);
  });

  it('refuses candidates that do not belong to the given passage', () => {
    const { candidates } = slidingPassage(30, 'p');
    const other = slidingPassage(30, 'q').tokens;
    expect(() => analyzeFound(other, candidates)).toThrow(/not part of the given passage/);
  });
});
