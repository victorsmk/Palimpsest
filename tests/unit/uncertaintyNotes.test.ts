import { describe, it, expect } from 'vitest';
import { uncertaintyNotes } from '@/lib/search/uncertainty';
import { tokenize } from '@/lib/tokenizer';
import type { SyllableResult } from '@/lib/syllables';

/** A line of the words of `text`, each with the given result (definite one-syllable unless overridden by word). */
function line(text: string, overrides: Record<string, Partial<SyllableResult>> = {}) {
  const tokens = tokenize('t', text).filter(t => t.kind === 'word');
  const syllableResults = tokens.map<SyllableResult>(t => ({ word: t.word, count: 1, confidence: 'definite', ...overrides[t.word] }));
  return { tokens, syllableResults };
}

describe('what a reader is told about a word whose count is uncertain', () => {
  it('says nothing about a poem whose words are all definite', () => {
    expect(uncertaintyNotes([line('cold winter rain'), line('dark river wind')])).toEqual([]);
  });

  it('names an ambiguous word, its possible counts and the one the poem relies on', () => {
    const notes = uncertaintyNotes([
      line('walks, especially', { especially: { count: 4, counts: [3, 4], confidence: 'ambiguous' } }),
    ]);
    expect(notes).toEqual([
      {
        word: 'especially',
        confidence: 'ambiguous',
        counts: [3, 4],
        used: 4,
        estimatedFrom: undefined,
        text: '“especially” can be said with 3 or 4 syllables. This poem counts it as 4.',
      },
    ]);
  });

  it('lists three or more counts with commas', () => {
    const [note] = uncertaintyNotes([line('odd', { odd: { count: 3, counts: [2, 3, 4], confidence: 'ambiguous' } })]);
    expect(note.text).toBe('“odd” can be said with 2, 3 or 4 syllables. This poem counts it as 3.');
  });

  it('says an estimated word is not in the dictionary, and which word the count was worked out from', () => {
    const [note] = uncertaintyNotes([
      line('so sombre', { sombre: { count: 2, confidence: 'estimated', estimatedFrom: 'somber' } }),
    ]);
    expect(note.confidence).toBe('estimated');
    expect(note.text).toBe('“sombre” is not in our dictionary. We estimated 2 syllables, from “somber”.');
  });

  it('uses the singular for one syllable', () => {
    const [note] = uncertaintyNotes([line('frank', { frank: { count: 1, confidence: 'estimated', estimatedFrom: 'franc' } })]);
    expect(note.text).toBe('“frank” is not in our dictionary. We estimated 1 syllable, from “franc”.');
  });

  it('says so when the word it was estimated from has more than one count', () => {
    const [note] = uncertaintyNotes([
      line('quarrelling', { quarrelling: { count: 3, counts: [2, 3], confidence: 'estimated', estimatedFrom: 'quarreling' } }),
    ]);
    expect(note.text).toBe('“quarrelling” is not in our dictionary. “quarreling” can be said with 2 or 3 syllables, and this poem counts it as 3.');
  });

  it('says a hyphenated word has a part the dictionary does not list', () => {
    const tokens = tokenize('t', 'tussore-silk').filter(t => t.kind === 'word');
    const [note] = uncertaintyNotes([
      { tokens, syllableResults: [{ word: tokens[0].word, count: 3, confidence: 'estimated', estimatedFrom: tokens[0].word }] },
    ]);
    expect(note.text).toBe('“tussore-silk” has a part our dictionary does not list. We estimated 3 syllables.');
  });

  it('gives one note for each distinct sentence, across all the lines, in reading order', () => {
    const hour = { count: 1, counts: [1, 2], confidence: 'ambiguous' as const };
    const notes = uncertaintyNotes([
      line('an hour', { hour }),
      line('one hour', { hour }), // the same word counted the same way: one note
      line('natural', { natural: { count: 3, counts: [2, 3], confidence: 'ambiguous' } }),
    ]);
    expect(notes.map(n => n.word)).toEqual(['hour', 'natural']);
  });

  it('writes the word without punctuation or capitals', () => {
    const [note] = uncertaintyNotes([line('Natural,', { natural: { count: 2, counts: [2, 3], confidence: 'ambiguous' } })]);
    expect(note.word).toBe('natural');
  });

  it('ignores words with no count at all', () => {
    expect(uncertaintyNotes([line('zzz', { zzz: { count: null, confidence: 'unknown' } })])).toEqual([]);
  });
});
