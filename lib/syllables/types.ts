export type SyllableConfidence = 'definite' | 'ambiguous' | 'unknown';

export interface SyllableResult {
  word: string;
  count: number | null;
  confidence: SyllableConfidence;
}
