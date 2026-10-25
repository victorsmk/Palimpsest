import type { Token } from '@/lib/models';
import { endsOnWeakWord } from '@/lib/search/lineEndings';
import { DEFAULT_MIN_OVERLAP, foundCandidateTokens, groupFoundCandidates } from './group';
import { calculatePageDNA } from './search';
import type { FoundAnalysis, FoundCandidate, FoundFamily, PageDnaBlock } from './types';

export interface FoundSelectionOptions {
  /** See DEFAULT_MIN_OVERLAP. */
  minOverlap?: number;
  /** Leave out candidates with a line that ends on a weak word. On by default. */
  excludeWeakEndings?: boolean;
}

/** The lines (1, 2 or 3) of a candidate that end on a weak word; empty when none do. */
export function weakEndingLines(candidate: FoundCandidate): (1 | 2 | 3)[] {
  const lines = [candidate.line1, candidate.line2, candidate.line3];
  return lines.flatMap((line, i) => (endsOnWeakWord(line.tokens) ? [(i + 1) as 1 | 2 | 3] : []));
}

export function hasWeakEnding(candidate: FoundCandidate): boolean {
  return weakEndingLines(candidate).length > 0;
}

/**
 * The families a Discover list shows. Weak-ending candidates are removed FIRST and the rest are
 * grouped afterwards, so a family's representative is its first candidate that survives. (Grouping
 * first would let a family vanish, or be shown through a weaker variant, just because its first
 * window happens to end a line on "the".)
 */
export function selectFoundFamilies(
  candidates: FoundCandidate[],
  options: FoundSelectionOptions = {}
): FoundFamily[] {
  const { minOverlap = DEFAULT_MIN_OVERLAP, excludeWeakEndings = true } = options;
  const kept = excludeWeakEndings ? candidates.filter(c => !hasWeakEnding(c)) : candidates;
  return groupFoundCandidates(kept, minOverlap);
}

/**
 * Everything a Found page needs about a passage: the families to list, the Page DNA (poems to
 * find, where they are, how dense), and what was left out. `tokens` is the passage's full token
 * list and `candidates` are the results of `foundSearch` on it.
 */
export function analyzeFound(
  tokens: Token[],
  candidates: FoundCandidate[],
  options: FoundSelectionOptions = {}
): FoundAnalysis {
  const words = tokens.filter(t => t.isSelectable && t.kind === 'word');
  const wordIndex = new Map(words.map((word, i) => [word.id, i]));
  const wordCount = words.length;

  const families = selectFoundFamilies(candidates, options);

  const blocks: PageDnaBlock[] = families.map(family => {
    const representative = foundCandidateTokens(family.representative);
    const startWord = wordIndex.get(representative[0].id);
    const endWord = wordIndex.get(representative[representative.length - 1].id);
    if (startWord === undefined || endWord === undefined) {
      throw new Error(`Candidate ${family.id} is not part of the given passage tokens.`);
    }
    return {
      familyId: family.id,
      startWord,
      endWord,
      startFraction: startWord / wordCount,
      endFraction: (endWord + 1) / wordCount,
      variants: family.members.length - 1,
    };
  });

  const excludeWeak = options.excludeWeakEndings ?? true;
  return {
    wordCount,
    families,
    pageDna: {
      poemsToFind: families.length,
      per100Words: calculatePageDNA(families.length, wordCount),
      wordsPerPoem: families.length > 0 ? Math.round(wordCount / families.length) : null,
      blocks,
    },
    hiddenByWeakEnding: excludeWeak ? candidates.filter(hasWeakEnding).length : 0,
    totalCandidates: candidates.length,
  };
}
