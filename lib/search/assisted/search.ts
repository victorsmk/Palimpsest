import type { Token } from '@/lib/models';
import type { SyllableResult } from '@/lib/syllables';
import { scoreLine, scorePoem } from './score';
import { selectDiverse } from './select';
import type {
  AssistedCandidate,
  AssistedLine,
  AssistedSearchOptions,
  AssistedSearchResult,
} from './types';

const DEFAULTS = {
  maxSpanPerLine: 16,
  maxGapBetweenWords: 3,
  maxGapBetweenLines: 6,
  maxLinesPerStart: 25,
  maxWorkPerStart: 50_000,
  limit: 10,
  maxSharedWords: 0.25,
  maxSpanOverlap: 0.4,
};

/** A line kept by the search: its words (by index into the passage's words) and its own score. */
interface KeptLine {
  line: AssistedLine;
  start: number;
  end: number;
  score: number;
}

/** What follows a first line: the best second and third line found after it, and their combined score. */
interface Continuation {
  line2: KeptLine;
  line3: KeptLine;
  score: number;
}

/**
 * Searches a passage for 5–7–5 poems made of words kept in their original order, skipping the rest
 * (assisted erasure). It is bounded, not exhaustive: a passage of 200 words holds trillions of
 * ways to make one, so
 *
 *  1. from every word as a starting point it keeps only the best few lines (5 and 7 syllables),
 *     which means the whole passage is searched, not just its beginning;
 *  2. for every first line it finds the best second and third lines after it (nearby, in order);
 *  3. it ranks the poems that makes and picks a set that differ from one another.
 *
 * Words with no known syllable count are never kept, only skipped over. Nothing is invented: every
 * poem returned has lines of exactly 5, 7 and 5 syllables made of real words in source order.
 */
export function assistedSearch(
  tokens: Token[],
  syllableMap: Map<string, SyllableResult>,
  passageId: string,
  options: AssistedSearchOptions = {}
): AssistedSearchResult {
  const o = { ...DEFAULTS, ...options };
  const words = tokens.filter(t => t.isSelectable && t.kind === 'word');
  const n = words.length;
  const syllables: SyllableResult[] = words.map(
    t => syllableMap.get(t.id) ?? { word: t.word, count: null, confidence: 'unknown' }
  );
  const counts = syllables.map(s => s.count);

  const stats = {
    wordCount: n,
    wordsWithoutCount: counts.filter(c => c === null).length,
    linesKept: { five: 0, seven: 0 },
    poemsConsidered: 0,
    workLimitReached: false,
    cancelled: false,
  };

  function makeLine(indices: number[], totalSyllables: number): KeptLine {
    const start = indices[0];
    const end = indices[indices.length - 1];
    const line: AssistedLine = {
      tokens: indices.map(i => words[i]),
      syllableResults: indices.map(i => syllables[i]),
      totalSyllables,
      gapCount: end - start + 1 - indices.length,
      hasUncertain: indices.some(i => syllables[i].confidence !== 'definite'),
    };
    return { line, start, end, score: scoreLine(line) };
  }

  /** The best lines of `target` syllables that begin with word `start`. */
  function linesFrom(start: number, target: number): KeptLine[] {
    const first = counts[start];
    if (first === null || first > target) return [];

    const found: KeptLine[] = [];
    const chosen = [start];
    const lastAllowed = Math.min(start + o.maxSpanPerLine - 1, n - 1);
    let steps = 0;
    let outOfWork = false;

    const walk = (last: number, sum: number) => {
      if (sum === target) {
        found.push(makeLine(chosen, target));
        return;
      }
      const reach = Math.min(last + 1 + o.maxGapBetweenWords, lastAllowed);
      for (let next = last + 1; next <= reach && !outOfWork; next++) {
        const c = counts[next];
        if (c === null || sum + c > target) continue;
        if (++steps > o.maxWorkPerStart) {
          outOfWork = true;
          return;
        }
        chosen.push(next);
        walk(next, sum + c);
        chosen.pop();
      }
    };
    walk(start, first);

    if (outOfWork) stats.workLimitReached = true;
    // Best first; among equals the one that ends sooner. Ties beyond that keep the order found.
    found.sort((a, b) => b.score - a.score || a.end - b.end);
    return found.slice(0, o.maxLinesPerStart);
  }

  const fives: KeptLine[][] = [];
  const sevens: KeptLine[][] = [];
  for (let start = 0; start < n; start++) {
    if (options.shouldCancel?.()) {
      return { candidates: [], stats: { ...stats, cancelled: true } };
    }
    fives.push(linesFrom(start, 5));
    sevens.push(linesFrom(start, 7));
  }
  stats.linesKept = {
    five: fives.reduce((sum, lines) => sum + lines.length, 0),
    seven: sevens.reduce((sum, lines) => sum + lines.length, 0),
  };

  // Best third line starting within reach of position p, and best second+third after p. Both are
  // found once for every position, so each first line is then matched in a single lookup.
  const reach = (p: number) => Math.min(p + o.maxGapBetweenLines, n - 1);

  const bestThird: (KeptLine | null)[] = Array.from({ length: n + 1 }, (_, p) => {
    let best: KeptLine | null = null;
    for (let q = p; q <= reach(p); q++) {
      const top = fives[q]?.[0];
      if (top && (!best || top.score > best.score)) best = top;
    }
    return best;
  });

  const bestTail: (Continuation | null)[] = Array.from({ length: n + 1 }, (_, p) => {
    let best: Continuation | null = null;
    for (let q = p; q <= reach(p); q++) {
      for (const line2 of sevens[q] ?? []) {
        const line3 = bestThird[line2.end + 1];
        if (!line3) continue;
        const score = line2.score + line3.score;
        if (!best || score > best.score) best = { line2, line3, score };
      }
    }
    return best;
  });

  const poems: AssistedCandidate[] = [];
  for (const group of fives) {
    for (const line1 of group) {
      const rest = bestTail[line1.end + 1];
      if (!rest) continue;
      const l1 = line1.line;
      const l2 = rest.line2.line;
      const l3 = rest.line3.line;
      const endWord = rest.line3.end;
      poems.push({
        id: [l1, l2, l3].map(l => l.tokens.map(t => t.id).join(',')).join('|'),
        passageId,
        line1: l1,
        line2: l2,
        line3: l3,
        startPosition: l1.tokens[0].position,
        endPosition: l3.tokens[l3.tokens.length - 1].position,
        startWord: line1.start,
        endWord,
        skippedWords: endWord - line1.start + 1 - (l1.tokens.length + l2.tokens.length + l3.tokens.length),
        hasUncertain: l1.hasUncertain || l2.hasUncertain || l3.hasUncertain,
        score: scorePoem(l1, l2, l3),
      });
    }
  }
  stats.poemsConsidered = poems.length;

  const wordIndexById = new Map(words.map((t, i) => [t.id, i]));
  return {
    candidates: selectDiverse(poems, wordIndexById, {
      limit: o.limit,
      maxSharedWords: o.maxSharedWords,
      maxSpanOverlap: o.maxSpanOverlap,
    }),
    stats,
  };
}
