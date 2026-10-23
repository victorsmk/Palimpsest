import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';
import type { FoundCandidate, FoundLine } from './types';

function buildLine(tokens: Token[], syllableResults: SyllableResult[]): FoundLine {
  const totalSyllables = syllableResults.reduce((acc, r) => acc + (r.count ?? 0), 0);
  const hasUncertain = syllableResults.some(r => r.confidence !== 'definite');
  return {
    tokens,
    syllableResults,
    totalSyllables,
    hasUncertain,
  };
}

function makeFingerprint(l1: Token[], l2: Token[], l3: Token[]): string {
  return [
    l1.map(t => t.id).join(','),
    l2.map(t => t.id).join(','),
    l3.map(t => t.id).join(','),
  ].join('|');
}

/**
 * Searches for contiguous 5–7–5 syllable sequences in a tokenized passage.
 * Intervening words within lines and between lines cannot be skipped.
 */
export function foundSearch(
  tokens: Token[],
  syllableMap: Map<string, SyllableResult>,
  passageId: string
): FoundCandidate[] {
  // Only search across selectable word tokens
  const wordTokens = tokens.filter(t => t.isSelectable && t.kind === 'word');
  const candidates: FoundCandidate[] = [];
  const seenFingerprints = new Set<string>();

  for (let startIdx = 0; startIdx < wordTokens.length; startIdx++) {
    // ─── Line 1 (Target: 5 syllables) ───────────────────────────
    let sum1 = 0;
    const l1Tokens: Token[] = [];
    const l1Syls: SyllableResult[] = [];

    for (let i = startIdx; i < wordTokens.length; i++) {
      const tok1 = wordTokens[i];
      const syl1 = syllableMap.get(tok1.id) ?? {
        word: tok1.word,
        count: null,
        confidence: 'unknown',
      };

      if (syl1.count === null) break; // Cannot count accurately through an unknown word
      sum1 += syl1.count;
      l1Tokens.push(tok1);
      l1Syls.push(syl1);

      if (sum1 === 5) {
        // ─── Line 2 (Target: 7 syllables) ─────────────────────────
        const line2Start = i + 1;
        if (line2Start >= wordTokens.length) break;

        let sum2 = 0;
        const l2Tokens: Token[] = [];
        const l2Syls: SyllableResult[] = [];

        for (let j = line2Start; j < wordTokens.length; j++) {
          const tok2 = wordTokens[j];
          const syl2 = syllableMap.get(tok2.id) ?? {
            word: tok2.word,
            count: null,
            confidence: 'unknown',
          };

          if (syl2.count === null) break;
          sum2 += syl2.count;
          l2Tokens.push(tok2);
          l2Syls.push(syl2);

          if (sum2 === 7) {
            // ─── Line 3 (Target: 5 syllables) ───────────────────────
            const line3Start = j + 1;
            if (line3Start >= wordTokens.length) break;

            let sum3 = 0;
            const l3Tokens: Token[] = [];
            const l3Syls: SyllableResult[] = [];

            for (let k = line3Start; k < wordTokens.length; k++) {
              const tok3 = wordTokens[k];
              const syl3 = syllableMap.get(tok3.id) ?? {
                word: tok3.word,
                count: null,
                confidence: 'unknown',
              };

              if (syl3.count === null) break;
              sum3 += syl3.count;
              l3Tokens.push(tok3);
              l3Syls.push(syl3);

              if (sum3 === 5) {
                const fp = makeFingerprint(l1Tokens, l2Tokens, l3Tokens);
                if (!seenFingerprints.has(fp)) {
                  seenFingerprints.add(fp);

                  const line1 = buildLine(l1Tokens, l1Syls);
                  const line2 = buildLine(l2Tokens, l2Syls);
                  const line3 = buildLine(l3Tokens, l3Syls);

                  candidates.push({
                    id: fp,
                    passageId,
                    line1,
                    line2,
                    line3,
                    startPosition: l1Tokens[0].position,
                    endPosition: l3Tokens[l3Tokens.length - 1].position,
                    hasUncertain: line1.hasUncertain || line2.hasUncertain || line3.hasUncertain,
                  });
                }
                break; // Found valid line 3 for this line 2
              }
              if (sum3 > 5) break; // Exceeded line 3 target
            }
            break; // Found valid line 2 for this line 1
          }
          if (sum2 > 7) break; // Exceeded line 2 target
        }
        break; // Found valid line 1 for this start position
      }
      if (sum1 > 5) break; // Exceeded line 1 target
    }
  }

  return candidates;
}

/**
 * Calculates the Page DNA metric:
 * Number of distinct contiguous 5–7–5 candidates discovered per 100 words.
 */
export function calculatePageDNA(candidatesCount: number, wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Number(((candidatesCount / wordCount) * 100).toFixed(2));
}
