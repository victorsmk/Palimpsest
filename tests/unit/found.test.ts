import { describe, it, expect } from 'vitest';
import { foundSearch, calculatePageDNA } from '@/lib/search/found';
import { tokenize } from '@/lib/tokenizer';
import type { SyllableResult } from '@/lib/syllables';

describe('Found Poetry Algorithm', () => {
  it('discovers a contiguous 5–7–5 sequence', () => {
    // 5 syllables: "The cold winter wind" (1 + 1 + 2 + 1 = 5)
    // 7 syllables: "brought with it dark heavy clouds" (1 + 1 + 1 + 1 + 2 + 1 = 7)
    // 5 syllables: "and a bitter rain" (1 + 1 + 2 + 1 = 5)
    const text = 'The cold winter wind brought with it dark heavy clouds and a bitter rain falling.';
    const tokens = tokenize('test-passage', text);

    const sylMap = new Map<string, SyllableResult>();
    const counts: Record<string, number> = {
      the: 1, cold: 1, winter: 2, wind: 1,
      brought: 1, with: 1, it: 1, dark: 1, heavy: 2, clouds: 1,
      and: 1, a: 1, bitter: 2, rain: 1, falling: 2,
    };

    for (const t of tokens) {
      if (t.isSelectable) {
        sylMap.set(t.id, {
          word: t.word,
          count: counts[t.word] ?? 1,
          confidence: 'definite',
        });
      }
    }

    const candidates = foundSearch(tokens, sylMap, 'test-passage');
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    const match = candidates[0];
    expect(match.line1.tokens.map(t => t.text).join(' ')).toBe('The cold winter wind');
    expect(match.line2.tokens.map(t => t.text).join(' ')).toBe('brought with it dark heavy clouds');
    expect(match.line3.tokens.map(t => t.text).join(' ')).toBe('and a bitter rain');
    expect(match.hasUncertain).toBe(false);
  });

  it('correctly calculates the Page DNA metric', () => {
    // 3 candidates across 150 words = 2.00 per 100 words
    expect(calculatePageDNA(3, 150)).toBe(2);
    // 0 candidates across 200 words = 0
    expect(calculatePageDNA(0, 200)).toBe(0);
    // 1 candidate across 80 words = 1.25 per 100 words
    expect(calculatePageDNA(1, 80)).toBe(1.25);
  });
});
