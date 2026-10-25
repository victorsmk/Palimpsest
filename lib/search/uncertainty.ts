import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';

/** A word in a poem whose syllable count is not certain, and what to tell the reader about it. */
export interface UncertaintyNote {
  /** The word, without punctuation. */
  word: string;
  confidence: 'ambiguous' | 'estimated';
  /** Every count the word may have; just the one count for an estimate that has no alternatives. */
  counts: number[];
  /** The count this poem relies on. */
  used: number;
  /** For an estimate: the dictionary word it was worked out from. */
  estimatedFrom?: string;
  /** One plain sentence for the reader. */
  text: string;
}

const syllables = (n: number) => `${n} ${n === 1 ? 'syllable' : 'syllables'}`;

/** "3", "3 or 4", "2, 3 or 4". */
function listCounts(counts: number[]): string {
  if (counts.length <= 1) return String(counts[0]);
  return `${counts.slice(0, -1).join(', ')} or ${counts[counts.length - 1]}`;
}

function describe(word: string, result: SyllableResult, counts: number[], used: number): string {
  const quoted = `“${word}”`;
  if (result.confidence === 'ambiguous') {
    return `${quoted} can be said with ${listCounts(counts)} syllables. This poem counts it as ${used}.`;
  }
  const from = result.estimatedFrom;
  if (!from || from === word || from.includes('-')) {
    return `${quoted} has a part our dictionary does not list. We estimated ${syllables(used)}.`;
  }
  if (counts.length > 1) {
    return `${quoted} is not in our dictionary. “${from}” can be said with ${listCounts(counts)} syllables, and this poem counts it as ${used}.`;
  }
  return `${quoted} is not in our dictionary. We estimated ${syllables(used)}, from “${from}”.`;
}

/**
 * What a reader should know about the uncertain words in a poem: one note for each distinct word
 * whose count is ambiguous (the dictionary's pronunciations disagree) or estimated (worked out from
 * a related word). Words with a definite count have no note, so a poem without any returns nothing.
 * `lines` are a candidate's lines, each with its tokens and the result recorded for every token.
 */
export function uncertaintyNotes(
  lines: { tokens: Token[]; syllableResults: SyllableResult[] }[]
): UncertaintyNote[] {
  const notes = new Map<string, UncertaintyNote>();
  for (const line of lines) {
    line.tokens.forEach((token, i) => {
      const result = line.syllableResults[i];
      if (!result || result.confidence === 'definite' || result.confidence === 'unknown' || result.count === null) return;
      const counts = result.counts && result.counts.length > 0 ? result.counts : [result.count];
      const note: UncertaintyNote = {
        word: token.word,
        confidence: result.confidence,
        counts,
        used: result.count,
        estimatedFrom: result.estimatedFrom,
        text: describe(token.word, result, counts, result.count),
      };
      if (!notes.has(note.text)) notes.set(note.text, note);
    });
  }
  return [...notes.values()];
}
