import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';

export interface FoundLine {
  tokens: Token[];
  syllableResults: SyllableResult[];
  totalSyllables: number;
  hasUncertain: boolean;
}

/** The words just before and just after a candidate, in reading order, as they stand in the source. */
export interface FoundContext {
  before: Token[];
  after: Token[];
}

/**
 * Candidates that are largely the same stretch of text: a sliding 5-7-5 window that moves one
 * word at a time produces many near-copies, and a family stands for all of them.
 */
export interface FoundFamily {
  /** Deterministic: `${passageId}-family-${representative start position}`. */
  id: string;
  /** The family's first candidate in source order. */
  representative: FoundCandidate;
  /** Every candidate in the family, the representative first, in source order. */
  members: FoundCandidate[];
  startPosition: number;
  endPosition: number;
}

/** One poem to find, as a block on the Page DNA strip. */
export interface PageDnaBlock {
  familyId: string;
  /** Index, among the passage's words, of the first and last word of the family's representative. */
  startWord: number;
  endWord: number;
  /** Where the block sits along a strip as fractions of the passage's words: 0 is the start, 1 the end. */
  startFraction: number;
  endFraction: number;
  /** Other ways to read this stretch (the family's remaining members). */
  variants: number;
}

/**
 * Page DNA: how many poems there are to find on a page, and where. A poem to find is a family
 * of overlapping 5-7-5 candidates (one stretch of text) that has no line ending on a weak word.
 * It measures how much there is to find, not how good it is.
 */
export interface PageDna {
  /** Number of poems to find: the shown families. */
  poemsToFind: number;
  /** Poems to find per 100 words (to two decimals). For a hover detail, not a headline. */
  per100Words: number;
  /** "About one every N words": N rounded, or null when there is nothing to find. */
  wordsPerPoem: number | null;
  /** One block per poem to find, in reading order, ready to draw as a strip. */
  blocks: PageDnaBlock[];
}

export interface FoundAnalysis {
  wordCount: number;
  /** What a Discover list shows: weak-ending candidates excluded, then grouped. */
  families: FoundFamily[];
  pageDna: PageDna;
  /** Candidates left out because a line ends on a weak word. */
  hiddenByWeakEnding: number;
  /** Every distinct candidate with definite counts that the search found, before anything is hidden or grouped. */
  totalCandidates: number;
  /**
   * Poems that depend on a word whose syllable count is uncertain (ambiguous, or estimated from a
   * related word): weak endings excluded and grouped like `families`, but kept apart from them and
   * from the Page DNA, which describe only candidates with definite counts.
   */
  uncertainFamilies: FoundFamily[];
  /** Candidates that rely on an uncertain count, before anything is hidden or grouped. */
  uncertainCandidates: number;
}

export interface FoundCandidate {
  id: string; // Deterministic fingerprint
  passageId: string;
  line1: FoundLine;
  line2: FoundLine;
  line3: FoundLine;
  startPosition: number;
  endPosition: number;
  hasUncertain: boolean;
}
