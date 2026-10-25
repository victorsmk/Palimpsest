import { foundSearch, type FoundCandidate } from '@/lib/search/found';
import { tokenize } from '@/lib/tokenizer';
import type { SyllableResult } from '@/lib/syllables';

/**
 * A passage of `count` one-syllable words, w0 w1 w2 ... Every start position then yields exactly
 * one 17-word candidate (5 + 7 + 5), so a passage of N words has N - 16 candidates, the one that
 * starts at word i covering words i .. i + 16. A candidate that starts at word s ends its three
 * lines at words s + 4, s + 11 and s + 16. A candidate that started k words after another shares
 * 17 - k words with it. That makes expected results easy to work out by hand.
 *
 * `theAt` replaces those words with "the", a weak line ending (still one syllable).
 */
export function slidingPassage(count: number, passageId = 'p', theAt: number[] = []) {
  const words = Array.from({ length: count }, (_, i) => (theAt.includes(i) ? 'the' : `w${i}`));
  const tokens = tokenize(passageId, words.join(' '));
  const syllables = new Map<string, SyllableResult>(
    tokens.map(t => [t.id, { word: t.word, count: 1, confidence: 'definite' }])
  );
  return { tokens, candidates: foundSearch(tokens, syllables, passageId) };
}

/** The word index a candidate starts at, whatever the word is. */
export const startIndex = (c: FoundCandidate, tokens: { id: string; kind: string }[]) =>
  tokens.filter(t => t.kind === 'word').findIndex(t => t.id === c.line1.tokens[0].id);
