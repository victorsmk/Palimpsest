import type { Token } from '@/lib/models';
import type { FoundCandidate, FoundContext } from './types';

export const DEFAULT_CONTEXT_WORDS = 8;

/**
 * The source text around a candidate: up to `words` words on each side, with any separators
 * (em dashes) between them, so the candidate can be shown where it was found. `tokens` is the
 * passage's full token list. Context stops at the start or end of the passage and does not
 * stop at paragraph breaks; tokens carry `paragraphIndex` for callers that want to.
 */
export function getFoundContext(
  candidate: FoundCandidate,
  tokens: Token[],
  words: number = DEFAULT_CONTEXT_WORDS
): FoundContext {
  const start = tokens.findIndex(t => t.position === candidate.startPosition);
  const end = tokens.findIndex(t => t.position === candidate.endPosition);
  if (start === -1 || end === -1) return { before: [], after: [] };

  const before: Token[] = [];
  let wordsBefore = 0;
  for (let i = start - 1; i >= 0 && wordsBefore < words; i--) {
    before.unshift(tokens[i]);
    if (tokens[i].kind === 'word') wordsBefore++;
  }

  const after: Token[] = [];
  let wordsAfter = 0;
  for (let i = end + 1; i < tokens.length && wordsAfter < words; i++) {
    after.push(tokens[i]);
    if (tokens[i].kind === 'word') wordsAfter++;
  }

  return { before, after };
}
