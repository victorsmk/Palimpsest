import { describe, it, expect, beforeAll } from 'vitest';
import { bundledPassages } from '@/lib/library/bundled';
import { getSyllableMap, lookupWord, type SyllableResult } from '@/lib/syllables';
import {
  DEFAULT_MIN_OVERLAP,
  foundCandidateTokens,
  foundSearch,
  getFoundContext,
  groupFoundCandidates,
  summarizeFound,
  type FoundCandidate,
} from '@/lib/search/found';
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

  describe('golden fixture (tests/fixtures/found-families.json)', () => {
    const expected = () => (golden as Golden)[id as keyof Golden];

    it('matches the raw and grouped counts and densities', () => {
      const { words, candidates } = get();
      expect(summarizeFound(candidates, words.length)).toEqual(expected().summary);
    });

    it('matches every family: where it is, how many windows it holds, and what it says', () => {
      const { passage, candidates } = get();
      const actual: GoldenFamily[] = groupFoundCandidates(candidates).map(family => {
        const r = family.representative;
        const context = getFoundContext(r, passage.tokens, 4);
        return {
          id: family.id,
          members: family.members.length,
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
  it('grouping turns sliding-window noise into a manageable set', () => {
    // 163 raw candidates become 56 families; Walden alone goes from 87 to 22.
    const totals = [...analysed.values()].map(a => ({
      raw: a.candidates.length,
      families: groupFoundCandidates(a.candidates).length,
    }));
    expect(totals).toEqual([
      { raw: 45, families: 19 },
      { raw: 87, families: 22 },
      { raw: 31, families: 15 },
    ]);
  });
});
