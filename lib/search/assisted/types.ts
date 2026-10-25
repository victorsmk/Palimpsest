import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';

export interface AssistedLine {
  tokens: Token[];
  syllableResults: SyllableResult[];
  totalSyllables: number;
  gapCount: number; // Number of skipped words within this line
  hasUncertain: boolean;
}

export interface AssistedCandidate {
  id: string; // Deterministic fingerprint
  passageId: string;
  line1: AssistedLine;
  line2: AssistedLine;
  line3: AssistedLine;
  startPosition: number;
  endPosition: number;
  /** Word indices (counting only words, from 0) of the poem's first and last word. */
  startWord: number;
  endWord: number;
  /** Words of the source passed over between the poem's first and last word. */
  skippedWords: number;
  hasUncertain: boolean;
  /**
   * A ranking aid, not a measure of literary quality. Higher means it satisfies more of the
   * heuristics in `score.ts`; only the order matters.
   */
  score: number;
}

export interface AssistedSearchOptions {
  /** Most source words one line may reach across, first retained word to last. Default 16. */
  maxSpanPerLine?: number;
  /** Most words that may be skipped between two retained words of one line. Default 3. */
  maxGapBetweenWords?: number;
  /** Most words that may be skipped between one line and the next. Default 6. */
  maxGapBetweenLines?: number;
  /** For each starting word, how many of the best-scoring lines are kept. Default 25. */
  maxLinesPerStart?: number;
  /** Most search steps spent on one starting word. Reaching it is reported in the stats. Default 50,000. */
  maxWorkPerStart?: number;
  /** How many poems to return. The ones returned are the same however many are asked for. Default 10. */
  limit?: number;
  /** Two returned poems may share at most this fraction of the smaller one's words. Default 0.25. */
  maxSharedWords?: number;
  /** Two returned poems may cover at most this fraction of the shorter one's stretch of the passage. Default 0.4. */
  maxSpanOverlap?: number;
  /**
   * Let words whose count is ambiguous or estimated take part (a word with several possible counts is
   * tried with each). Poems that use one are flagged `hasUncertain` and rank lower. Off by default:
   * only words with a definite count are used.
   */
  allowUncertain?: boolean;
  /** Checked between starting words; when it returns true the search stops and returns nothing. */
  shouldCancel?: () => boolean;
}

export interface AssistedSearchStats {
  wordCount: number;
  /** Words with no usable count in this search. They are never kept, only skipped over. */
  wordsWithoutCount: number;
  /** Words that have a count only through a dictionary disagreement or an estimate. */
  uncertainWords: number;
  /** 5- and 7-syllable lines the search kept (the best few for each starting word). */
  linesKept: { five: number; seven: number };
  /** Poems put together and ranked before the diverse set was chosen. */
  poemsConsidered: number;
  /** True when some starting word used up its search budget, so lines starting there may be missing. */
  workLimitReached: boolean;
  cancelled: boolean;
}

/**
 * The search is bounded, not exhaustive: it keeps the best few lines from every starting word and
 * one best continuation for each first line, and says so when a work limit cut it short.
 */
export interface AssistedSearchResult {
  /** Ranked best first, and different from one another (see `maxSharedWords`, `maxSpanOverlap`). */
  candidates: AssistedCandidate[];
  stats: AssistedSearchStats;
}
