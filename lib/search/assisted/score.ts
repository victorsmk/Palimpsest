import { WEAK_LINE_ENDINGS } from '@/lib/search/lineEndings';
import type { AssistedLine } from './types';

/**
 * The ranking rules, each one a plain heuristic from the spec (§9). They order candidates; they do
 * not measure how good a poem is. A weak ending costs points but never rules a poem out.
 */
export const WEIGHTS = {
  /** A line ending on "the", "of", "and" and the like. */
  weakEnding: -15,
  /** A line ending on a comma, full stop or similar: it ends where the sentence pauses. */
  punctuatedEnding: 4,
  /** Times the share of a line's words that are not function words (0 to 1). */
  contentShare: 20,
  /** Each source word skipped between two retained words of one line. */
  skippedWord: -2,
  /** A sentence ending in the middle of a line, so the line reads across a full stop. */
  sentenceBreakInside: -8,
  /** A line containing a word whose syllable count is not certain. */
  uncertainLine: -10,
  /** Each extra use of the same content word in one poem. */
  repeatedContentWord: -5,
  /** Each distinct long word, a rough stand-in for distinctive vocabulary... */
  longWord: 2,
  /** ...counted up to this many. */
  longWordMax: 4,
  longWordLetters: 7,
} as const;

/** Words that carry little meaning of their own: the weak endings plus pronouns and auxiliaries. */
const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  ...WEAK_LINE_ENDINGS,
  'i', 'me', 'he', 'him', 'she', 'it', 'we', 'us', 'you', 'they', 'them', 'this', 'these', 'those',
  'there', 'no', 'not', 'had', 'has', 'have', 'do', 'did', 'does', 'will', 'would', 'can', 'could',
  'shall', 'should', 'may', 'might', 'then', 'when', 'while', 'how', 'what', 'why', 'where', 'all',
  'any', 'some', 'such', 'very', 'am', 'our', 'your',
]);

const isFunctionWord = (word: string) => FUNCTION_WORDS.has(word);

const ENDS_SENTENCE = /[.!?]["'”’)]*$/;
const ENDS_PHRASE = /[,;:.!?]["'”’)]*$/;

/** Scores one line on its own: how it ends, how much of it is content, how much was skipped. */
export function scoreLine(line: Pick<AssistedLine, 'tokens' | 'gapCount' | 'hasUncertain'>): number {
  const { tokens } = line;
  const last = tokens[tokens.length - 1];
  let score = 0;

  if (last) {
    if (WEAK_LINE_ENDINGS.has(last.word)) score += WEIGHTS.weakEnding;
    else if (ENDS_PHRASE.test(last.text)) score += WEIGHTS.punctuatedEnding;
  }

  if (tokens.length > 0) {
    const content = tokens.filter(t => !isFunctionWord(t.word)).length;
    score += Math.round((content / tokens.length) * WEIGHTS.contentShare);
  }

  score += line.gapCount * WEIGHTS.skippedWord;
  score += tokens.slice(0, -1).filter(t => ENDS_SENTENCE.test(t.text)).length * WEIGHTS.sentenceBreakInside;
  if (line.hasUncertain) score += WEIGHTS.uncertainLine;
  return score;
}

/** Scores a whole poem: its three lines, plus how much it repeats itself and how varied its words are. */
export function scorePoem(line1: AssistedLine, line2: AssistedLine, line3: AssistedLine): number {
  const lines = [line1, line2, line3];
  let score = lines.reduce((sum, line) => sum + scoreLine(line), 0);

  const counts = new Map<string, number>();
  for (const { word } of lines.flatMap(line => line.tokens)) {
    if (!isFunctionWord(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  for (const count of counts.values()) score += (count - 1) * WEIGHTS.repeatedContentWord;

  const longWords = [...counts.keys()].filter(word => word.length >= WEIGHTS.longWordLetters).length;
  score += Math.min(longWords, WEIGHTS.longWordMax) * WEIGHTS.longWord;
  return score;
}

/** The poem score, under the name the first version used. */
export const scoreCandidate = scorePoem;
