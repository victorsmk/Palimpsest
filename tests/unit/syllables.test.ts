import { describe, it, expect } from 'vitest';
import { countSyllables, countSyllablesBatch } from '@/lib/syllables';

describe('Syllable Counter module', () => {
  it('correctly counts definite common words', async () => {
    const cat = await countSyllables('cat');
    expect(cat.count).toBe(1);
    expect(cat.confidence).toBe('definite');

    const water = await countSyllables('water');
    expect(water.count).toBe(2);
    expect(water.confidence).toBe('definite');

    const beautiful = await countSyllables('beautiful');
    expect(beautiful.count).toBe(3);
    expect(beautiful.confidence).toBe('definite');

    const university = await countSyllables('university');
    expect(university.count).toBe(5);
    expect(university.confidence).toBe('definite');
  });

  it('handles standard contractions with dictionary entries', async () => {
    const dont = await countSyllables("don't");
    expect(dont.count).toBe(1);
    expect(dont.confidence).toBe('definite');

    const havent = await countSyllables("haven't");
    expect(havent.count).toBe(2);
    expect(havent.confidence).toBe('definite');
  });

  it('resolves hyphenated compounds by summing component words', async () => {
    const compound = await countSyllables('honey-sweet');
    expect(compound.count).toBe(3); // honey(2) + sweet(1)
    expect(compound.confidence).toBe('definite');

    const spartan = await countSyllables('spartan-like');
    expect(spartan.count).toBe(3); // spartan(2) + like(1)
    expect(spartan.confidence).toBe('definite');
  });

  it('marks words with conflicting pronunciation counts as ambiguous', async () => {
    const res = await countSyllables('acquiring');
    expect(res.count).toBeNull();
    expect(res.confidence).toBe('ambiguous');

    const delib = await countSyllables('deliberately');
    expect(delib.count).toBeNull();
    expect(delib.confidence).toBe('ambiguous');
  });

  it('marks unknown words and non-words explicitly as unknown', async () => {
    const gibberish = await countSyllables('xkwzql');
    expect(gibberish.count).toBeNull();
    expect(gibberish.confidence).toBe('unknown');

    const numberWord = await countSyllables('1847');
    expect(numberWord.count).toBeNull();
    expect(numberWord.confidence).toBe('unknown');
  });

  it('counts batches in order with consistent results', async () => {
    const words = ['I', 'went', 'to', 'the', 'woods'];
    const results = await countSyllablesBatch(words);

    expect(results).toHaveLength(5);
    expect(results.map(r => r.count)).toEqual([1, 1, 1, 1, 1]);
    expect(results.every(r => r.confidence === 'definite')).toBe(true);
  });
});
