import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  countChoices,
  countSyllables,
  getSyllableMap,
  lookupWord,
  possibleCounts,
  type SyllableMap,
  type SyllableResult,
} from '@/lib/syllables';

describe('estimating words the dictionary does not list', () => {
  // A small dictionary, so every expected count below can be worked out by hand.
  const map: SyllableMap = {
    somber: 2, chiding: 2, box: 1, bridge: 1, flit: 1, chase: 1, create: 2, want: 1, straggle: 2,
    make: 1, run: 1, frank: 1, happy: 2, sturdy: 2, quick: 1, flame: 1, like: 1, hope: 1, face: 1,
    quarreling: [2, 3], endeavoring: [3, 4], realization: 5, realize: 2, hour: [1, 2], glass: 1,
    ant: 1, boxes: 2,
  };
  const look = (word: string) => lookupWord(word, map);

  it.each([
    // spelling variants: the variant's own count
    ['sombre', 2, 'somber'],
    ['realisation', 5, 'realization'],
    // plural: +1 after a sibilant
    ['chidings', 2, 'chiding'],
    ['bridges', 2, 'bridge'],
    // -ed: +1 only after a t or d sound; a doubled consonant is undone
    ['flitted', 2, 'flit'],
    ['chased', 1, 'chase'],
    ['created', 3, 'create'],
    ['wanted', 2, 'want'],
    // -ing: +1, but not after consonant + le
    ['straggling', 2, 'straggle'],
    ['making', 2, 'make'],
    ['running', 2, 'run'],
    // -er and y/i
    ['franker', 2, 'frank'],
    ['happier', 3, 'happy'],
    // -ly
    ['sturdily', 3, 'sturdy'],
    ['quickly', 2, 'quick'],
    // -like, -less
    ['flamelike', 2, 'flame'],
    ['hopeless', 2, 'hope'],
  ])('works out %s as %i syllables from "%s", and says it is an estimate', (word, count, from) => {
    expect(look(word)).toEqual({ word, count, confidence: 'estimated', estimatedFrom: from });
  });

  it('keeps several counts when the word it is worked out from has several', () => {
    expect(look('quarrelling')).toEqual({ word: 'quarrelling', count: null, confidence: 'estimated', counts: [2, 3], estimatedFrom: 'quarreling' });
    expect(look('endeavouring')).toEqual({ word: 'endeavouring', count: null, confidence: 'estimated', counts: [3, 4], estimatedFrom: 'endeavoring' });
  });

  it('never calls an estimate definite', () => {
    for (const word of ['sombre', 'chidings', 'flitted', 'straggling', 'franker', 'sturdily', 'flamelike', 'quarrelling']) {
      expect(look(word).confidence).toBe('estimated');
    }
  });

  it('prefers a dictionary entry to any rule', () => {
    // "boxes" is listed (as 2, whatever the rule would say), so it is definite.
    expect(look('boxes')).toEqual({ word: 'boxes', count: 2, confidence: 'definite' });
  });

  it('leaves a word unknown when no rule finds a dictionary word', () => {
    for (const word of ['laburnum', 'xkwzql', 'unmown']) {
      expect(look(word)).toEqual({ word, count: null, confidence: 'unknown' });
    }
  });

  it('leaves numbers and words with apostrophes alone', () => {
    expect(look('1847').confidence).toBe('unknown');
    expect(look("ain't's").confidence).toBe('unknown');
  });

  it('does not use a stem shorter than three letters', () => {
    // "ab" + "ing" would otherwise find an "ab" if the dictionary had one.
    expect(lookupWord('abing', { ab: 1 }).confidence).toBe('unknown');
    expect(lookupWord('abbing', { abb: 1 }).confidence).toBe('estimated');
  });

  it('sums the parts of a hyphenated word, and estimates it when a part is an estimate', () => {
    expect(look('hour-glass')).toEqual({ word: 'hour-glass', count: null, confidence: 'ambiguous', counts: [2, 3] });
    // somber (2) + face (1), where "faced" is itself an estimate
    expect(look('sombre-faced')).toEqual({ word: 'sombre-faced', count: 3, confidence: 'estimated', estimatedFrom: 'sombre-faced' });
    expect(look('sombre-laburnum').confidence).toBe('unknown');
  });

  it('keeps the counts of an ambiguous word through a possessive', () => {
    expect(look("hour's")).toEqual({ word: "hour's", count: null, confidence: 'ambiguous', counts: [1, 2] });
  });

  it('is not fooled by a word that is also an Object property', () => {
    expect(look('constructor').confidence).toBe('unknown');
    expect(look('__proto__').confidence).toBe('unknown');
  });
});

describe('the passages\' own uncertain words, against the real dictionary', () => {
  it.each([
    ['hour', 'ambiguous', [1, 2]],
    ['especially', 'ambiguous', [3, 4]],
    ['natural', 'ambiguous', [2, 3]],
    ['privileges', 'ambiguous', [3, 4]],
    ['deliberately', 'ambiguous', [4, 5]],
    ['circling', 'ambiguous', [2, 3]],
    ['quarrelling', 'estimated', [2, 3]],
    ['endeavouring', 'estimated', [3, 4]],
  ])('%s is %s with counts %j', async (word, confidence, counts) => {
    const result = await countSyllables(word);
    expect(result.confidence).toBe(confidence);
    expect(result.counts).toEqual(counts);
    expect(result.count).toBeNull();
  });

  it.each([
    ['sombre', 2, 'somber'],
    ['chidings', 2, 'chiding'],
    ['franker', 2, 'frank'],
    ['sturdily', 3, 'sturdy'],
    ['flamelike', 2, 'flame'],
    ['flitted', 2, 'flit'],
    ['straggling', 2, 'straggle'],
  ])('%s is estimated at %i from "%s"', async (word, count, from) => {
    const result = await countSyllables(word);
    expect(result).toMatchObject({ count, confidence: 'estimated', estimatedFrom: from });
  });

  it.each(['laburnum', 'unmown', 'woodbine', 'tussore-silk'])('%s stays unknown: nothing in the dictionary to work it out from', async word => {
    expect(await countSyllables(word)).toMatchObject({ count: null, confidence: 'unknown' });
  });
});

describe('the counts a search may use', () => {
  const definite: SyllableResult = { word: 'cat', count: 1, confidence: 'definite' };
  const ambiguous: SyllableResult = { word: 'hour', count: null, confidence: 'ambiguous', counts: [1, 2] };
  const estimated: SyllableResult = { word: 'sombre', count: 2, confidence: 'estimated', estimatedFrom: 'somber' };
  const unknown: SyllableResult = { word: 'zzz', count: null, confidence: 'unknown' };

  it('lists every count a word may have', () => {
    expect(possibleCounts(definite)).toEqual([1]);
    expect(possibleCounts(ambiguous)).toEqual([1, 2]);
    expect(possibleCounts(estimated)).toEqual([2]);
    expect(possibleCounts(unknown)).toEqual([]);
  });

  it('offers only definite words unless uncertainty is allowed', () => {
    expect(countChoices(definite, false)).toEqual([{ count: 1, result: definite }]);
    expect(countChoices(ambiguous, false)).toEqual([]);
    expect(countChoices(estimated, false)).toEqual([]);
    expect(countChoices(unknown, false)).toEqual([]);
  });

  it('offers each possible count of an uncertain word when it is allowed, with the choice recorded', () => {
    expect(countChoices(ambiguous, true)).toEqual([
      { count: 1, result: { ...ambiguous, count: 1 } },
      { count: 2, result: { ...ambiguous, count: 2 } },
    ]);
    expect(countChoices(estimated, true)).toEqual([{ count: 2, result: estimated }]);
    expect(countChoices(unknown, true)).toEqual([]);
  });
});

describe('the dictionary file', () => {
  it('agrees with the raw CMU dictionary for every word, and lists the counts of each ambiguous word', async () => {
    const map = await getSyllableMap();
    const raw = new Map<string, Set<number>>();
    for (const line of fs.readFileSync(path.join(process.cwd(), 'data/cmudict/cmudict.dict'), 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';;;')) continue;
      const [spelled, ...phonemes] = trimmed.split(/\s+/);
      const word = spelled.replace(/\(\d+\)$/, '').toLowerCase();
      if (!raw.has(word)) raw.set(word, new Set());
      raw.get(word)!.add(phonemes.filter(p => /[012]$/.test(p)).length);
    }

    expect(Object.keys(map)).toHaveLength(raw.size);
    let ambiguous = 0;
    for (const [word, counts] of raw) {
      const expected = [...counts].sort((a, b) => a - b);
      const entry = map[word];
      if (expected.length === 1) {
        if (entry !== expected[0]) throw new Error(`${word}: expected ${expected[0]}, the map has ${JSON.stringify(entry)}`);
      } else {
        ambiguous++;
        if (JSON.stringify(entry) !== JSON.stringify(expected)) throw new Error(`${word}: expected ${JSON.stringify(expected)}, the map has ${JSON.stringify(entry)}`);
      }
    }
    expect(ambiguous).toBe(1715);
  });
});
