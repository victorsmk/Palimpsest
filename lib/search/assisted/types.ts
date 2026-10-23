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
  hasUncertain: boolean;
  score: number;
}

export interface AssistedSearchOptions {
  maxSpanPerLine?: number;
  maxCandidates?: number;
}
