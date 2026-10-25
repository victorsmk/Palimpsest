import type { AssistedCandidate } from './types';

export interface DiversityLimits {
  limit: number;
  maxSharedWords: number;
  maxSpanOverlap: number;
}

const wordIndices = (c: AssistedCandidate, indexOf: Map<string, number>) =>
  [c.line1, c.line2, c.line3].flatMap(line => line.tokens.map(t => indexOf.get(t.id)!));

/**
 * Picks a manageable set of poems that are different from one another. Candidates are taken best
 * first (ties go to the one that starts earlier in the passage), and one is skipped when it is too
 * much like a poem already taken: it shares too many of that poem's words, or it covers too much of
 * the same stretch of the passage. The result does not depend on `limit`: asking for more only
 * continues the same list.
 */
export function selectDiverse(
  ranked: AssistedCandidate[],
  wordIndexById: Map<string, number>,
  { limit, maxSharedWords, maxSpanOverlap }: DiversityLimits
): AssistedCandidate[] {
  const ordered = [...ranked].sort(
    (a, b) => b.score - a.score || a.startWord - b.startWord || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  const chosen: { candidate: AssistedCandidate; words: Set<number> }[] = [];
  for (const candidate of ordered) {
    if (chosen.length >= limit) break;
    const indices = wordIndices(candidate, wordIndexById);
    const span = candidate.endWord - candidate.startWord + 1;

    const tooSimilar = chosen.some(({ candidate: other, words }) => {
      const shared = indices.filter(i => words.has(i)).length;
      if (shared / Math.min(indices.length, words.size) > maxSharedWords) return true;
      const overlap = Math.min(candidate.endWord, other.endWord) - Math.max(candidate.startWord, other.startWord) + 1;
      const otherSpan = other.endWord - other.startWord + 1;
      return overlap > 0 && overlap / Math.min(span, otherSpan) > maxSpanOverlap;
    });
    if (!tooSimilar) chosen.push({ candidate, words: new Set(indices) });
  }
  return chosen.map(({ candidate }) => candidate);
}
