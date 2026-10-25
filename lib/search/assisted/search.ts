import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';
import { WEAK_LINE_ENDINGS } from '@/lib/search/lineEndings';
import type { AssistedCandidate, AssistedLine, AssistedSearchOptions } from './types';

function makeFingerprint(l1: Token[], l2: Token[], l3: Token[]): string {
  return [
    l1.map(t => t.id).join(','),
    l2.map(t => t.id).join(','),
    l3.map(t => t.id).join(','),
  ].join('|');
}

/**
 * Evaluates candidate quality according to Section 9 heuristics:
 * Higher score = more poetic / readable / cohesive.
 */
export function scoreCandidate(
  l1: AssistedLine,
  l2: AssistedLine,
  l3: AssistedLine
): number {
  let score = 100;

  for (const line of [l1, l2, l3]) {
    // 1. Penalize weak function words at the end of lines (-15 pts)
    const lastWord = line.tokens[line.tokens.length - 1]?.word ?? '';
    if (WEAK_LINE_ENDINGS.has(lastWord)) {
      score -= 15;
    }

    // 2. Penalize excessive gaps between retained words (-2 pts per skipped word)
    score -= line.gapCount * 2;

    // 3. Penalize uncertainty in syllable counting (-10 pts)
    if (line.hasUncertain) {
      score -= 10;
    }

    // 4. Reward content words (+3 pts each)
    const contentWords = line.tokens.filter(t => !WEAK_LINE_ENDINGS.has(t.word)).length;
    score += contentWords * 3;
  }

  return score;
}

interface GeneratedSubsequence {
  tokens: Token[];
  syllables: SyllableResult[];
  gaps: number;
}

/**
 * Generates all in-order subsequences starting at or after `startIndex`
 * within `maxSpan` tokens that sum to exactly `targetSyllables`.
 */
function findSubsequences(
  wordTokens: Token[],
  syllableMap: Map<string, SyllableResult>,
  startIndex: number,
  targetSyllables: number,
  maxSpan: number
): GeneratedSubsequence[] {
  const results: GeneratedSubsequence[] = [];
  const limitIndex = Math.min(startIndex + maxSpan, wordTokens.length);

  function search(
    currentIndex: number,
    accumulatedSyllables: number,
    chosenTokens: Token[],
    chosenSyllables: SyllableResult[],
    gapsCount: number
  ) {
    if (accumulatedSyllables === targetSyllables) {
      results.push({
        tokens: [...chosenTokens],
        syllables: [...chosenSyllables],
        gaps: gapsCount,
      });
      return;
    }

    if (currentIndex >= limitIndex || accumulatedSyllables > targetSyllables) {
      return;
    }

    for (let i = currentIndex; i < limitIndex; i++) {
      const tok = wordTokens[i];
      const syl = syllableMap.get(tok.id) ?? {
        word: tok.word,
        count: null,
        confidence: 'unknown',
      };

      if (syl.count === null) continue; // Skip tokens with unknown count in assisted search
      if (accumulatedSyllables + syl.count > targetSyllables) continue; // Branch pruning

      const addedGaps = chosenTokens.length > 0 ? i - currentIndex : 0;

      search(
        i + 1,
        accumulatedSyllables + syl.count,
        [...chosenTokens, tok],
        [...chosenSyllables, syl],
        gapsCount + addedGaps
      );
    }
  }

  search(startIndex, 0, [], [], 0);
  return results;
}

/**
 * Searches for non-contiguous 5–7–5 syllable sequences in source order.
 * Bounds total work and limits span to keep computation tractable and responsive.
 */
export function assistedSearch(
  tokens: Token[],
  syllableMap: Map<string, SyllableResult>,
  passageId: string,
  options: AssistedSearchOptions = {}
): AssistedCandidate[] {
  const maxSpan = options.maxSpanPerLine ?? 20;
  const maxCandidates = options.maxCandidates ?? 150;

  const wordTokens = tokens.filter(t => t.isSelectable && t.kind === 'word');
  const candidates: AssistedCandidate[] = [];
  const seen = new Set<string>();

  for (let s1 = 0; s1 < wordTokens.length && candidates.length < maxCandidates; s1++) {
    const lines1 = findSubsequences(wordTokens, syllableMap, s1, 5, maxSpan);

    for (const l1 of lines1) {
      if (!l1.tokens.length) continue;
      const lastL1Index = wordTokens.indexOf(l1.tokens[l1.tokens.length - 1]);
      const s2 = lastL1Index + 1;
      if (s2 >= wordTokens.length) continue;

      const lines2 = findSubsequences(wordTokens, syllableMap, s2, 7, maxSpan);

      for (const l2 of lines2) {
        if (!l2.tokens.length) continue;
        const lastL2Index = wordTokens.indexOf(l2.tokens[l2.tokens.length - 1]);
        const s3 = lastL2Index + 1;
        if (s3 >= wordTokens.length) continue;

        const lines3 = findSubsequences(wordTokens, syllableMap, s3, 5, maxSpan);

        for (const l3 of lines3) {
          if (!l3.tokens.length) continue;

          const fp = makeFingerprint(l1.tokens, l2.tokens, l3.tokens);
          if (seen.has(fp)) continue;
          seen.add(fp);

          const line1: AssistedLine = {
            tokens: l1.tokens,
            syllableResults: l1.syllables,
            totalSyllables: 5,
            gapCount: l1.gaps,
            hasUncertain: l1.syllables.some(s => s.confidence !== 'definite'),
          };

          const line2: AssistedLine = {
            tokens: l2.tokens,
            syllableResults: l2.syllables,
            totalSyllables: 7,
            gapCount: l2.gaps,
            hasUncertain: l2.syllables.some(s => s.confidence !== 'definite'),
          };

          const line3: AssistedLine = {
            tokens: l3.tokens,
            syllableResults: l3.syllables,
            totalSyllables: 5,
            gapCount: l3.gaps,
            hasUncertain: l3.syllables.some(s => s.confidence !== 'definite'),
          };

          const score = scoreCandidate(line1, line2, line3);

          candidates.push({
            id: fp,
            passageId,
            line1,
            line2,
            line3,
            startPosition: l1.tokens[0].position,
            endPosition: l3.tokens[l3.tokens.length - 1].position,
            hasUncertain: line1.hasUncertain || line2.hasUncertain || line3.hasUncertain,
            score,
          });

          if (candidates.length >= maxCandidates) break;
        }
        if (candidates.length >= maxCandidates) break;
      }
      if (candidates.length >= maxCandidates) break;
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
