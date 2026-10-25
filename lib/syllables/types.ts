/**
 * How sure the count is:
 *  - definite:  the dictionary gives one count for the word (or it is built from such words).
 *  - ambiguous: the dictionary's pronunciations disagree, so the word may have several counts.
 *  - estimated: the word is not in the dictionary; its count was worked out from a related dictionary
 *               word by a documented rule (see counter.ts). Never presented as definite.
 *  - unknown:   no count at all.
 */
export type SyllableConfidence = 'definite' | 'ambiguous' | 'estimated' | 'unknown';

export interface SyllableResult {
  word: string;
  /** The count to use. Null when there is no single count: unknown, or several possible counts. */
  count: number | null;
  confidence: SyllableConfidence;
  /** Every count the word may have, ascending, when there is more than one (ambiguous words and some estimates). */
  counts?: number[];
  /** For an estimate: the dictionary word it was worked out from, e.g. "somber" for "sombre". */
  estimatedFrom?: string;
}

/** The dictionary: one count, or the ascending counts that its pronunciations disagree on. */
export type SyllableMap = Record<string, number | number[]>;

/** Every count a word may have: its one count, all of them for an ambiguous word, or none when unknown. */
export function possibleCounts(result: SyllableResult): number[] {
  if (result.counts && result.counts.length > 0) return result.counts;
  return result.count === null ? [] : [result.count];
}

/** One count a word may take in a search, with the result recorded for that choice. */
export interface CountChoice {
  count: number;
  result: SyllableResult;
}

/**
 * The counts a search may give a word. A definite word has its one count. An ambiguous or estimated
 * word has each of its possible counts when `allowUncertain` is set, and none otherwise, so a search
 * that does not allow uncertainty never uses it. Each choice carries the word's result with that
 * count filled in, so a poem records which count it relied on.
 */
export function countChoices(result: SyllableResult, allowUncertain: boolean): CountChoice[] {
  if (result.confidence === 'definite') {
    return result.count === null ? [] : [{ count: result.count, result }];
  }
  if (!allowUncertain) return [];
  return possibleCounts(result).map(count => ({ count, result: { ...result, count } }));
}
