import type { Token } from '@/lib/models';
import { countChoices, type SyllableResult } from '@/lib/syllables';
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

export interface FoundSearchOptions {
  /**
   * Let words whose count is ambiguous (the dictionary's pronunciations disagree) or estimated (not in
   * the dictionary, worked out by a rule) take part. A word with several possible counts is tried
   * with each. Candidates that use one are flagged `hasUncertain`. Off by default: only words with a
   * definite count are used, exactly as before.
   */
  allowUncertain?: boolean;
}

const TARGETS = [5, 7, 5] as const;

/**
 * Searches for contiguous 5–7–5 syllable sequences in a tokenized passage.
 * Intervening words within lines and between lines cannot be skipped.
 */
export function foundSearch(
  tokens: Token[],
  syllableMap: Map<string, SyllableResult>,
  passageId: string,
  options: FoundSearchOptions = {}
): FoundCandidate[] {
  const allowUncertain = options.allowUncertain ?? false;
  // Only search across selectable word tokens
  const wordTokens = tokens.filter(t => t.isSelectable && t.kind === 'word');
  const choices = wordTokens.map(token =>
    countChoices(
      syllableMap.get(token.id) ?? { word: token.word, count: null, confidence: 'unknown' },
      allowUncertain
    )
  );
  const candidates: FoundCandidate[] = [];
  const seenFingerprints = new Set<string>();

  for (let startIdx = 0; startIdx < wordTokens.length; startIdx++) {
    const lines: { tokens: Token[]; syllables: SyllableResult[] }[] = [];
    let lineTokens: Token[] = [];
    let lineSyllables: SyllableResult[] = [];

    // Extend the current line with word i, once for each count the word may have. A line ends the
    // first time it reaches its target exactly; going past it, or meeting a word with no usable
    // count, ends that branch.
    const walk = (lineIdx: number, i: number, sum: number) => {
      if (i >= wordTokens.length) return;
      for (const choice of choices[i]) {
        const next = sum + choice.count;
        if (next > TARGETS[lineIdx]) continue;

        lineTokens.push(wordTokens[i]);
        lineSyllables.push(choice.result);

        if (next < TARGETS[lineIdx]) {
          walk(lineIdx, i + 1, next);
        } else if (lineIdx < 2) {
          lines.push({ tokens: lineTokens, syllables: lineSyllables });
          const [keptTokens, keptSyllables] = [lineTokens, lineSyllables];
          lineTokens = [];
          lineSyllables = [];
          walk(lineIdx + 1, i + 1, 0);
          lineTokens = keptTokens;
          lineSyllables = keptSyllables;
          lines.pop();
        } else {
          const [l1, l2] = lines;
          const fp = makeFingerprint(l1.tokens, l2.tokens, lineTokens);
          if (!seenFingerprints.has(fp)) {
            seenFingerprints.add(fp);

            const line1 = buildLine([...l1.tokens], [...l1.syllables]);
            const line2 = buildLine([...l2.tokens], [...l2.syllables]);
            const line3 = buildLine([...lineTokens], [...lineSyllables]);

            candidates.push({
              id: fp,
              passageId,
              line1,
              line2,
              line3,
              startPosition: l1.tokens[0].position,
              endPosition: line3.tokens[line3.tokens.length - 1].position,
              hasUncertain: line1.hasUncertain || line2.hasUncertain || line3.hasUncertain,
            });
          }
        }

        lineTokens.pop();
        lineSyllables.pop();
      }
    };
    walk(0, startIdx, 0);
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
