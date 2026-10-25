import type { Token } from '@/lib/models';

/**
 * Function words that make a weak place to end a line of verse. Shared by the Assisted search
 * (which penalises them in ranking) and by Found mode (which hides candidates that end a line
 * on one). A heuristic, not a law: plenty of good poems end a line on "the".
 */
export const WEAK_LINE_ENDINGS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'if', 'as', 'than',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'that', 'which', 'who', 'whom', 'whose', 'from', 'into', 'my', 'his', 'her', 'their', 'its',
]);

/** Whether the last word of a line is one of the weak line endings. */
export function endsOnWeakWord(lineTokens: Token[]): boolean {
  const last = lineTokens[lineTokens.length - 1];
  return last !== undefined && WEAK_LINE_ENDINGS.has(last.word);
}
