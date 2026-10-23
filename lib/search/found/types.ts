import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';

export interface FoundLine {
  tokens: Token[];
  syllableResults: SyllableResult[];
  totalSyllables: number;
  hasUncertain: boolean;
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
