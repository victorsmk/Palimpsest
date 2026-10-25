import { describe, it, expect, beforeAll } from 'vitest';
import { bundledPassages } from '@/lib/library/bundled';
import { getSyllableMap, lookupWord, type SyllableResult } from '@/lib/syllables';
import {
  DEFAULT_MIN_OVERLAP,
  analyzeFound,
  foundCandidateTokens,
  foundSearch,
  getFoundContext,
  groupFoundCandidates,
  type FoundCandidate,
} from '@/lib/search/found';
import { WEAK_LINE_ENDINGS } from '@/lib/search/lineEndings';
import type { Passage, Token } from '@/lib/models';
import golden from '../fixtures/found-families.json';

type Golden = typeof golden;
type GoldenFamily = Golden['jane-eyre-ch1']['families'][number];

const text = (tokens: { text: string }[]) => tokens.map(t => t.text).join(' ');

interface Analysed {
  passage: Passage;
  words: Token[];
  syllables: Map<string, SyllableResult>;
  candidates: FoundCandidate[];
}

const analysed = new Map<string, Analysed>();

beforeAll(async () => {
  const dictionary = await getSyllableMap();
  for (const passage of bundledPassages) {
    const words = passage.tokens.filter(t => t.isSelectable && t.kind === 'word');
    const syllables = new Map(words.map(t => [t.id, lookupWord(t.word, dictionary)]));
    analysed.set(passage.id, {
      passage,
      words,
      syllables,
      candidates: foundSearch(passage.tokens, syllables, passage.id),
    });
  }
});

describe.each(bundledPassages.map(p => p.id))('Found mode on %s', id => {
  const get = () => analysed.get(id)!;

  describe('every candidate is real, contiguous source text', () => {
    it('is a run of consecutive words of the passage, in order, with nothing skipped', () => {
      const { words, candidates } = get();
      const indexOf = new Map(words.map((w, i) => [w.id, i]));
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        const indexes = foundCandidateTokens(candidate).map(t => indexOf.get(t.id));
        expect(indexes.every(i => i !== undefined)).toBe(true);
        indexes.forEach((index, i) => {
          if (i > 0) expect(index, `after "${candidate.line1.tokens[0].text}"`).toBe(indexes[i - 1]! + 1);
        });
      }
    });

    it('keeps the source text and punctuation exactly as written', () => {
      const { passage, candidates } = get();
      const compact = (s: string) => s.replace(/[\s—]+/g, '');
      const source = compact(passage.sourceText);
      for (const candidate of candidates) {
        const run = compact(foundCandidateTokens(candidate).map(t => t.text).join(''));
        expect(source.includes(run), run).toBe(true);
      }
    });

    it('adds up to 5-7-5 syllables when counted afresh, with every count definite', async () => {
      const { candidates } = get();
      const dictionary = await getSyllableMap();
      for (const candidate of candidates) {
        const lines = [candidate.line1, candidate.line2, candidate.line3];
        const totals = lines.map(line =>
          line.tokens.map(t => lookupWord(t.word, dictionary)).reduce((sum, r) => {
            expect(r.confidence, `${r.word} in "${text(line.tokens)}"`).toBe('definite');
            return sum + (r.count as number);
          }, 0)
        );
        expect(totals, text(foundCandidateTokens(candidate))).toEqual([5, 7, 5]);
        expect(candidate.hasUncertain).toBe(false);
      }
    });

    it('reports each candidate once', () => {
      const { candidates } = get();
      expect(new Set(candidates.map(c => c.id)).size).toBe(candidates.length);
    });
  });

  describe('grouping', () => {
    it('puts every candidate in exactly one family, with the representative first in source order', () => {
      const { candidates } = get();
      const families = groupFoundCandidates(candidates);
      const members = families.flatMap(f => f.members);
      expect(members).toHaveLength(candidates.length);
      expect(new Set(members.map(c => c.id))).toEqual(new Set(candidates.map(c => c.id)));
      for (const family of families) {
        expect(family.members[0]).toBe(family.representative);
        expect(family.members.map(m => m.startPosition)).toEqual(
          [...family.members.map(m => m.startPosition)].sort((a, b) => a - b)
        );
      }
      expect(families.map(f => f.startPosition)).toEqual(
        [...families.map(f => f.startPosition)].sort((a, b) => a - b)
      );
    });

    it('follows the rule: members overlap their representative by more than half, and no earlier family would have taken them', () => {
      const shared = (a: Token[], b: Token[]) => {
        const ids = new Set(a.map(t => t.id));
        return b.filter(t => ids.has(t.id)).length;
      };
      const overlaps = (a: FoundCandidate, b: FoundCandidate) => {
        const [ta, tb] = [foundCandidateTokens(a), foundCandidateTokens(b)];
        return shared(ta, tb) > DEFAULT_MIN_OVERLAP * Math.min(ta.length, tb.length);
      };
      const families = groupFoundCandidates(get().candidates);
      families.forEach((family, f) => {
        for (const member of family.members.slice(1)) {
          expect(overlaps(family.representative, member)).toBe(true);
          for (const earlier of families.slice(0, f)) {
            expect(overlaps(earlier.representative, member)).toBe(false);
          }
        }
      });
      // So the representatives are mutually distinct stretches of text.
      for (let i = 0; i < families.length; i++) {
        for (let j = i + 1; j < families.length; j++) {
          expect(overlaps(families[i].representative, families[j].representative)).toBe(false);
        }
      }
    });
  });

  describe('source context', () => {
    it('sits directly either side of the candidate and stops at the passage edges', () => {
      const { passage, candidates } = get();
      const last = passage.tokens[passage.tokens.length - 1].position;
      for (const candidate of candidates) {
        const { before, after } = getFoundContext(candidate, passage.tokens, 6);
        if (before.length) expect(before[before.length - 1].position).toBe(candidate.startPosition - 1);
        if (after.length) expect(after[0].position).toBe(candidate.endPosition + 1);
        expect(before.filter(t => t.kind === 'word').length).toBeLessThanOrEqual(6);
        expect(after.filter(t => t.kind === 'word').length).toBeLessThanOrEqual(6);
        if (candidate.startPosition === 0) expect(before).toEqual([]);
        if (candidate.endPosition === last) expect(after).toEqual([]);
      }
    });
  });

  describe('what is shown, and what is hidden', () => {
    const lastWords = (c: FoundCandidate) =>
      [c.line1, c.line2, c.line3].map(l => l.tokens[l.tokens.length - 1].word);
    const hasWeak = (c: FoundCandidate) => lastWords(c).some(w => WEAK_LINE_ENDINGS.has(w));

    it('shows no candidate that ends a line on a weak word, and hides every one that does', () => {
      const { passage, candidates } = get();
      const analysis = analyzeFound(passage.tokens, candidates);
      const shown = analysis.families.flatMap(f => f.members);
      const shownIds = new Set(shown.map(c => c.id));

      expect(shown.some(hasWeak)).toBe(false);
      for (const candidate of candidates) {
        expect(shownIds.has(candidate.id), lastWords(candidate).join(',')).toBe(!hasWeak(candidate));
      }
      expect(analysis.hiddenByWeakEnding).toBe(candidates.filter(hasWeak).length);
      expect(shown.length + analysis.hiddenByWeakEnding).toBe(candidates.length);
    });

    it('gives the Page DNA its figures from the shown families', () => {
      const { passage, words, candidates } = get();
      const { families, pageDna } = analyzeFound(passage.tokens, candidates);

      expect(pageDna.poemsToFind).toBe(families.length);
      expect(pageDna.per100Words).toBe(Math.round((families.length / words.length) * 10000) / 100);
      expect(pageDna.wordsPerPoem).toBe(Math.round(words.length / families.length));
      expect(pageDna.blocks).toHaveLength(families.length);
    });

    it('draws each block over exactly the words of its representative poem', () => {
      const { passage, words, candidates } = get();
      const { families, pageDna } = analyzeFound(passage.tokens, candidates);
      const indexOf = new Map(words.map((w, i) => [w.id, i]));
      families.forEach((family, i) => {
        const tokens = foundCandidateTokens(family.representative);
        const block = pageDna.blocks[i];
        expect(block.startWord).toBe(indexOf.get(tokens[0].id));
        expect(block.endWord).toBe(indexOf.get(tokens[tokens.length - 1].id));
        expect(block.endWord - block.startWord + 1).toBe(tokens.length);
        expect(block.startFraction).toBeCloseTo(block.startWord / words.length, 10);
        expect(block.endFraction).toBeCloseTo((block.endWord + 1) / words.length, 10);
        expect(block.variants).toBe(family.members.length - 1);
      });
    });
  });

  describe('golden fixture (tests/fixtures/found-families.json)', () => {
    const expected = () => (golden as Golden)[id as keyof Golden];

    it('matches the Page DNA: counts, density, and where each poem sits', () => {
      const { passage, candidates } = get();
      const analysis = analyzeFound(passage.tokens, candidates);
      const { wordCount, totalCandidates, hiddenByWeakEnding, pageDna } = expected();
      expect({
        wordCount: analysis.wordCount,
        totalCandidates: analysis.totalCandidates,
        hiddenByWeakEnding: analysis.hiddenByWeakEnding,
        pageDna: analysis.pageDna,
      }).toEqual({ wordCount, totalCandidates, hiddenByWeakEnding, pageDna });
    });

    it('matches every shown family: where it is, how many variants it has, and what it says', () => {
      const { passage, candidates } = get();
      const actual: GoldenFamily[] = analyzeFound(passage.tokens, candidates).families.map(family => {
        const r = family.representative;
        const context = getFoundContext(r, passage.tokens, 4);
        return {
          id: family.id,
          variants: family.members.length - 1,
          span: [family.startPosition, family.endPosition],
          lines: [text(r.line1.tokens), text(r.line2.tokens), text(r.line3.tokens)],
          context: { before: text(context.before), after: text(context.after) },
        };
      });
      expect(actual).toEqual(expected().families);
    });
  });
});

describe('Found mode across the library', () => {
  it('turns sliding-window noise into a short list of poems to find', () => {
    const totals = [...analysed.values()].map(a => {
      const analysis = analyzeFound(a.passage.tokens, a.candidates);
      return {
        found: analysis.totalCandidates,
        hidden: analysis.hiddenByWeakEnding,
        poemsToFind: analysis.pageDna.poemsToFind,
        wordsPerPoem: analysis.pageDna.wordsPerPoem,
      };
    });
    // Jane Eyre, Walden, Dorian Gray: 163 candidates found, 121 hidden for weak endings,
    // the rest grouped into 24 poems to find.
    expect(totals).toEqual([
      { found: 45, hidden: 35, poemsToFind: 8, wordsPerPoem: 30 },
      { found: 87, hidden: 65, poemsToFind: 9, wordsPerPoem: 24 },
      { found: 31, hidden: 21, poemsToFind: 7, wordsPerPoem: 28 },
    ]);
  });
});
