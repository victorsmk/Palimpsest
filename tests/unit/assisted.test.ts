import { describe, it, expect } from 'vitest';
import { assistedSearch, scoreCandidate } from '@/lib/search/assisted';
import { tokenize } from '@/lib/tokenizer';
import type { SyllableResult } from '@/lib/syllables';

describe('Assisted Erasure Algorithm', () => {
  it('discovers non-contiguous 5–7–5 sequences skipping words', () => {
    // We want:
    // line 1 (5 syl): "cold winter wind" (1 + 2 + 1 = 4? no, "the cold winter wind" = 5)
    // line 2 (7 syl): "bringing dark heavy storm clouds" (2 + 1 + 2 + 1 + 1 = 7)
    // line 3 (5 syl): "in bitter cold" (1 + 2 + 1 = 4? "in the bitter cold" = 5)
    const text = 'Now the very cold winter wind was quickly bringing some dark heavy storm clouds high in the bitter cold sky.';
    const tokens = tokenize('assisted-test', text);

    const counts: Record<string, number> = {
      now: 1, the: 1, very: 2, cold: 1, winter: 2, wind: 1,
      was: 1, quickly: 2, bringing: 2, some: 1, dark: 1, heavy: 2, storm: 1, clouds: 1,
      high: 1, in: 1, bitter: 2, sky: 1,
    };

    const sylMap = new Map<string, SyllableResult>();
    for (const t of tokens) {
      if (t.isSelectable) {
        sylMap.set(t.id, {
          word: t.word,
          count: counts[t.word] ?? 1,
          confidence: 'definite',
        });
      }
    }

    const { candidates } = assistedSearch(tokens, sylMap, 'assisted-test', {
      maxSpanPerLine: 10,
      limit: 10,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].line1.totalSyllables).toBe(5);
    expect(candidates[0].line2.totalSyllables).toBe(7);
    expect(candidates[0].line3.totalSyllables).toBe(5);
  });

  it('penalizes weak function words at line endings in scoring', () => {
    const goodLine = {
      tokens: [
        { id: '1', text: 'cold', word: 'cold', position: 0, paragraphIndex: 0, lineBreakBefore: false, kind: 'word' as const, isSelectable: true },
        { id: '2', text: 'winter', word: 'winter', position: 1, paragraphIndex: 0, lineBreakBefore: false, kind: 'word' as const, isSelectable: true },
        { id: '3', text: 'rain', word: 'rain', position: 2, paragraphIndex: 0, lineBreakBefore: false, kind: 'word' as const, isSelectable: true },
      ],
      syllableResults: [
        { word: 'cold', count: 1, confidence: 'definite' as const },
        { word: 'winter', count: 2, confidence: 'definite' as const },
        { word: 'rain', count: 1, confidence: 'definite' as const },
      ],
      totalSyllables: 5,
      gapCount: 0,
      hasUncertain: false,
    };

    const weakLine = {
      ...goodLine,
      tokens: [
        { id: '1', text: 'cold', word: 'cold', position: 0, paragraphIndex: 0, lineBreakBefore: false, kind: 'word' as const, isSelectable: true },
        { id: '2', text: 'winter', word: 'winter', position: 1, paragraphIndex: 0, lineBreakBefore: false, kind: 'word' as const, isSelectable: true },
        { id: '3', text: 'the', word: 'the', position: 2, paragraphIndex: 0, lineBreakBefore: false, kind: 'word' as const, isSelectable: true },
      ],
    };

    const dummyLine2 = { ...goodLine, totalSyllables: 7 };
    const dummyLine3 = { ...goodLine, totalSyllables: 5 };

    const scoreGood = scoreCandidate(goodLine, dummyLine2, dummyLine3);
    const scoreWeak = scoreCandidate(weakLine, dummyLine2, dummyLine3);

    expect(scoreGood).toBeGreaterThan(scoreWeak);
  });
});
