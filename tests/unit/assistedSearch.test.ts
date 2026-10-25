import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { assistedSearch, scoreLine, scorePoem, type AssistedCandidate, type AssistedLine } from '@/lib/search/assisted';
import { tokenize } from '@/lib/tokenizer';
import { getSyllableMap, lookupWord, type SyllableResult } from '@/lib/syllables';

/** A passage of one-syllable words w0 w1 w2 ..., with `the` at the listed positions. */
function sliding(count: number, theAt: number[] = [], unknownAt: number[] = []) {
  const words = Array.from({ length: count }, (_, i) => (theAt.includes(i) ? 'the' : `w${i}`));
  const tokens = tokenize('p', words.join(' '));
  const syllables = new Map<string, SyllableResult>();
  tokens.forEach((t, i) =>
    syllables.set(t.id, { word: t.word, count: unknownAt.includes(i) ? null : 1, confidence: unknownAt.includes(i) ? 'unknown' : 'definite' })
  );
  return { tokens, syllables, run: (options = {}) => assistedSearch(tokens, syllables, 'p', options) };
}

const startsOf = (candidates: AssistedCandidate[]) => candidates.map(c => c.startWord);

/** A line of verse for scoring: the words of `text`, with `gaps` words skipped inside it. */
function lineOf(text: string, gaps = 0, hasUncertain = false): AssistedLine {
  const tokens = tokenize('t', text).filter(t => t.kind === 'word');
  return { tokens, syllableResults: [], totalSyllables: 5, gapCount: gaps, hasUncertain };
}

describe('scoring a line', () => {
  it('gives a line of content words its full share and nothing else', () => {
    expect(scoreLine(lineOf('cold winter rain'))).toBe(20); // 3 of 3 are content words: 20
  });

  it('takes 15 points off a line that ends on a weak word, and counts the weak word as not content', () => {
    // 2 of 3 content: round(13.33) = 13, minus 15
    expect(scoreLine(lineOf('cold winter the'))).toBe(-2);
  });

  it('adds 4 for a line that ends where the sentence pauses', () => {
    expect(scoreLine(lineOf('cold winter rain,'))).toBe(24);
    expect(scoreLine(lineOf('cold winter rain.'))).toBe(24);
  });

  it('does not reward a pause after a weak word', () => {
    expect(scoreLine(lineOf('cold winter the,'))).toBe(-2);
  });

  it('takes 2 off for each word skipped inside the line', () => {
    expect(scoreLine(lineOf('cold winter rain', 3))).toBe(14);
  });

  it('takes 8 off for a full stop in the middle of a line', () => {
    expect(scoreLine(lineOf('rain. cold'))).toBe(12); // 20 - 8
    expect(scoreLine(lineOf('cold rain.'))).toBe(24); // the final full stop is the line's own ending
  });

  it('takes 10 off a line with an uncertain syllable count', () => {
    expect(scoreLine(lineOf('cold winter rain', 0, true))).toBe(10);
  });

  it('counts pronouns and auxiliaries as function words', () => {
    expect(scoreLine(lineOf('I went home'))).toBe(13); // 2 of 3: 13
  });
});

describe('scoring a poem', () => {
  const [a, b, c] = [lineOf('cold winter rain'), lineOf('dark river wind'), lineOf('quiet snow falls')];

  it('adds up the three lines', () => {
    expect(scorePoem(a, b, c)).toBe(60);
  });

  it('takes 5 off for each extra use of a content word, but not of a function word', () => {
    expect(scorePoem(a, lineOf('cold river wind'), c)).toBe(55);
    expect(scorePoem(lineOf('cold winter rain, the'), lineOf('dark river wind, the'), c)).toBe(
      scoreLine(lineOf('cold winter rain, the')) + scoreLine(lineOf('dark river wind, the')) + 20
    );
  });

  it('adds 2 for each distinct long word, up to 4 of them', () => {
    expect(scorePoem(a, lineOf('darkness river wind'), c)).toBe(62);
    const long = [lineOf('darkness mountain outside'), lineOf('thousand evening mirrors'), lineOf('shadows corridor windows')];
    expect(scorePoem(long[0], long[1], long[2])).toBe(60 + 8); // nine long words, counted up to four
  });
});

describe('the search, on a passage of one-syllable words', () => {
  it('finds poems all along the passage, not only at the beginning', () => {
    // Every start gives one equally good 17-word poem (words s..s+16). Taking them best first, earliest
    // first, a poem is skipped if it shares more than 25% of its words with one already taken: a poem
    // starting k words later shares 17 - k words, so the next is 13 words on (4 shared of 17 is 23.5%).
    const { run } = sliding(100);
    const { candidates } = run({ limit: 99 });
    expect(startsOf(candidates)).toEqual([0, 13, 26, 39, 52, 65, 78]);
    expect(candidates.every(c => c.endWord === c.startWord + 16 && c.skippedWords === 0)).toBe(true);
  });

  it('gives lines of exactly 5, 7 and 5 words here, in order', () => {
    const [first] = sliding(100).run().candidates;
    expect(first.line1.tokens.map(t => t.text)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4']);
    expect(first.line2.tokens.map(t => t.text)).toEqual(['w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11']);
    expect(first.line3.tokens.map(t => t.text)).toEqual(['w12', 'w13', 'w14', 'w15', 'w16']);
    expect([first.line1, first.line2, first.line3].map(l => l.totalSyllables)).toEqual([5, 7, 5]);
  });

  it('asking for more only continues the same list', () => {
    const { run } = sliding(100);
    expect(startsOf(run({ limit: 3 }).candidates)).toEqual([0, 13, 26]);
    expect(startsOf(run({ limit: 5 }).candidates)).toEqual([0, 13, 26, 39, 52]);
  });

  it('allows closer poems when the limits on sharing and overlap are loosened', () => {
    const { run } = sliding(100);
    const loose = run({ limit: 99, maxSharedWords: 0.5, maxSpanOverlap: 0.6 });
    // shared 17 - k <= 8.5 and overlap 17 - k <= 10.2 -> k >= 9 (8 shared of 17 is 47%)
    expect(startsOf(loose.candidates).slice(0, 4)).toEqual([0, 9, 18, 27]);
  });

  it('ranks a poem that avoids "the" above any that touches it', () => {
    // "the" sits at word 4. A poem from the first word after it has three lines of 20 points each.
    const { candidates } = sliding(60, [4]).run({ limit: 99 });
    expect(candidates[0].startWord).toBe(5);
    expect(candidates[0].score).toBe(60);
  });

  it('skips over words to avoid ending a line on a weak one, and says how many it skipped', () => {
    // "the" at words 4, 5 and 6. A first line from word 0 can end on the first "the" (4 of 5 words are
    // content: 16, minus 15 for the weak ending = 1) or skip all three to end on word 7 (20, minus 3
    // skipped words at 2 each = 14). Without the weak-ending penalty it would take the first.
    // Diversity limits are lifted so that this poem, which overlaps better ones, is still returned.
    const { candidates } = sliding(40, [4, 5, 6]).run({ limit: 9999, maxSharedWords: 1, maxSpanOverlap: 1 });
    const poem = candidates.find(c => c.startWord === 0)!;
    expect(poem.line1.tokens.map(t => t.text)).toEqual(['w0', 'w1', 'w2', 'w3', 'w7']);
    expect(poem.line1.gapCount).toBe(3);
    expect(poem.skippedWords).toBe(3);
  });

  it('never keeps a word with no known syllable count, only skips it', () => {
    const { run, tokens } = sliding(60, [], [3, 20]);
    const result = run({ limit: 99 });
    const unknownIds = new Set([tokens[3].id, tokens[20].id]);
    expect(result.stats.wordsWithoutCount).toBe(2);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      for (const t of [...c.line1.tokens, ...c.line2.tokens, ...c.line3.tokens]) expect(unknownIds.has(t.id)).toBe(false);
    }
  });

  it('finds nothing in a passage too short for three lines', () => {
    const result = sliding(16).run();
    expect(result.candidates).toEqual([]);
    expect(result.stats.poemsConsidered).toBe(0);
  });

  it('stops and returns nothing when cancelled, rather than a partial result', () => {
    const result = sliding(100).run({ shouldCancel: () => true });
    expect(result.candidates).toEqual([]);
    expect(result.stats.cancelled).toBe(true);
  });

  it('reports a spent work limit, and still invents nothing', () => {
    const { run } = sliding(60);
    const none = run({ maxWorkPerStart: 3 }); // a 5-syllable line takes 4 steps: nothing can be completed
    expect(none.stats.workLimitReached).toBe(true);
    expect(none.candidates).toEqual([]);

    const some = run({ maxWorkPerStart: 40 });
    expect(some.stats.workLimitReached).toBe(true);
    expect(some.candidates.length).toBeGreaterThan(0);
    for (const c of some.candidates) {
      expect([c.line1, c.line2, c.line3].map(l => l.syllableResults.reduce((s, r) => s + (r.count ?? 0), 0))).toEqual([5, 7, 5]);
    }
    expect(run().stats.workLimitReached).toBe(false);
  });
});

describe('the search, on the real passages', () => {
  const passages: { title: string; tokens: ReturnType<typeof tokenize>; syllables: Map<string, SyllableResult>; wordCount: number }[] = [];

  beforeAll(async () => {
    const dictionary = await getSyllableMap();
    for (const file of ['jane-eyre-ch1.json', 'walden-woods.json', 'dorian-gray-ch1.json']) {
      const passage = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/texts', file), 'utf8'));
      const tokens = tokenize(passage.id, passage.sourceText);
      const words = tokens.filter(t => t.isSelectable && t.kind === 'word');
      passages.push({
        title: passage.title,
        tokens,
        syllables: new Map(words.map(t => [t.id, lookupWord(t.word, dictionary)])),
        wordCount: words.length,
      });
    }
  });

  it('returns whole, ordered, 5-7-5 poems of real words, spread over the passage and different from one another', () => {
    expect(passages).toHaveLength(3);
    for (const { title, tokens, syllables, wordCount } of passages) {
      const index = new Map(tokens.filter(t => t.kind === 'word').map((t, i) => [t.id, i]));
      const { candidates, stats } = assistedSearch(tokens, syllables, 'p', { limit: 50 });

      expect(candidates.length, title).toBeGreaterThanOrEqual(6);
      expect(stats.workLimitReached, title).toBe(false); // real passages stay within the default budget

      for (const c of candidates) {
        const lines = [c.line1, c.line2, c.line3];
        expect(lines.map(l => l.syllableResults.reduce((s, r) => s + (r.count ?? 0), 0)), title).toEqual([5, 7, 5]);
        const positions = lines.flatMap(l => l.tokens.map(t => index.get(t.id)!));
        expect(positions, title).toEqual([...positions].sort((x, y) => x - y)); // source order, no repeats
        expect(new Set(positions).size).toBe(positions.length);
        expect(c.endWord - c.startWord + 1 - positions.length).toBe(c.skippedWords);
        for (const l of lines) {
          const own = l.tokens.map(t => index.get(t.id)!);
          expect(own[own.length - 1] - own[0] + 1, title).toBeLessThanOrEqual(16); // span limit
          expect(own.slice(1).every((p, i) => p - own[i] - 1 <= 3), title).toBe(true); // gap limit
        }
        expect(c.hasUncertain).toBe(false);
      }

      // Different from one another: no pair shares more than 25% of its words or covers over 40% of a stretch.
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i];
          const b = candidates[j];
          const wa = new Set([a.line1, a.line2, a.line3].flatMap(l => l.tokens.map(t => t.id)));
          const wb = [b.line1, b.line2, b.line3].flatMap(l => l.tokens.map(t => t.id));
          expect(wb.filter(w => wa.has(w)).length / Math.min(wa.size, wb.length), `${title} ${i}/${j}`).toBeLessThanOrEqual(0.25);
          const overlap = Math.min(a.endWord, b.endWord) - Math.max(a.startWord, b.startWord) + 1;
          if (overlap > 0) {
            const shorter = Math.min(a.endWord - a.startWord, b.endWord - b.startWord) + 1;
            expect(overlap / shorter, `${title} ${i}/${j}`).toBeLessThanOrEqual(0.4);
          }
        }
      }

      // The old search stopped in the first 15% of the passage. This one reaches into the last fifth too.
      expect(Math.max(...candidates.map(c => c.endWord)), title).toBeGreaterThan(wordCount * 0.8);
      expect(Math.min(...candidates.map(c => c.startWord)), title).toBeLessThan(wordCount * 0.1);
    }
  });

  it('gives the same poems every time, and asking for fewer gives the front of the same list', () => {
    for (const { title, tokens, syllables } of passages) {
      const ids = (limit: number) => assistedSearch(tokens, syllables, 'p', { limit }).candidates.map(c => c.id);
      const full = ids(10);
      expect(ids(10), title).toEqual(full);
      expect(ids(4), title).toEqual(full.slice(0, 4));
    }
  });

  it('puts the best poems first', () => {
    for (const { title, tokens, syllables } of passages) {
      const scores = assistedSearch(tokens, syllables, 'p', { limit: 20 }).candidates.map(c => c.score);
      expect(scores, title).toEqual([...scores].sort((a, b) => b - a));
    }
  });
});
