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

export interface FoundSummary {
  wordCount: number;
  /** Every distinct candidate the search found. */
  candidateCount: number;
  /** Candidates after overlapping near-copies are grouped into families. */
  familyCount: number;
  /** Candidates per 100 words (Page DNA as defined by the spec). */
  candidatesPer100Words: number;
  /** Families per 100 words: density of distinct material, not of sliding windows. */
  familiesPer100Words: number;
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
