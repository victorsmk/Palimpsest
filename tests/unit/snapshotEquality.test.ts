import { describe, it, expect } from 'vitest';
import { createDefaultSnapshot, snapshotsEqual, type EditorSnapshot } from '@/lib/editor';
import { tokenize } from '@/lib/tokenizer';

// alpha(0) beta(1) —(2) gamma(3): three words and a dash
const tokens = tokenize('p', 'alpha beta—gamma');

const snapshot = (overrides: Partial<EditorSnapshot> = {}): EditorSnapshot => ({
  retainedTokenIds: ['p-token-0000', 'p-token-0001'],
  lineBreaks: ['p-token-0000'],
  erasureStyle: 'blackout',
  title: 'T',
  notes: 'N',
  ...overrides,
});

describe('the untouched passage', () => {
  it('keeps every word and nothing else, so a dash is not kept', () => {
    expect(createDefaultSnapshot(tokens)).toEqual({
      retainedTokenIds: ['p-token-0000', 'p-token-0001', 'p-token-0003'],
      lineBreaks: [],
      erasureStyle: 'blackout',
      title: '',
      notes: '',
    });
  });
});

describe('whether two poems are the same', () => {
  it('is true for the same snapshot, and for a copy', () => {
    expect(snapshotsEqual(snapshot(), snapshot())).toBe(true);
    expect(snapshotsEqual(snapshot(), { ...snapshot(), retainedTokenIds: [...snapshot().retainedTokenIds] })).toBe(true);
  });

  it.each([
    ['a word kept', { retainedTokenIds: ['p-token-0000', 'p-token-0001', 'p-token-0003'] }],
    ['a different word kept', { retainedTokenIds: ['p-token-0000', 'p-token-0003'] }],
    ['a word erased', { retainedTokenIds: ['p-token-0000'] }],
    ['a line break added', { lineBreaks: ['p-token-0000', 'p-token-0001'] }],
    ['a line break moved', { lineBreaks: ['p-token-0001'] }],
    ['a line break removed', { lineBreaks: [] }],
    ['the erasure style', { erasureStyle: 'faded' as const }],
    ['the title', { title: 'T2' }],
    ['the notes', { notes: '' }],
  ])('is false after %s', (_name, change) => {
    expect(snapshotsEqual(snapshot(), snapshot(change))).toBe(false);
    expect(snapshotsEqual(snapshot(change), snapshot())).toBe(false);
  });

  it('does not depend on the order words or breaks are listed in', () => {
    expect(
      snapshotsEqual(
        snapshot({ retainedTokenIds: ['p-token-0001', 'p-token-0000'], lineBreaks: ['p-token-0001', 'p-token-0000'] }),
        snapshot({ retainedTokenIds: ['p-token-0000', 'p-token-0001'], lineBreaks: ['p-token-0000', 'p-token-0001'] })
      )
    ).toBe(true);
  });

  it('is not fooled by a repeated id standing in for a different one', () => {
    expect(
      snapshotsEqual(
        snapshot({ retainedTokenIds: ['p-token-0000', 'p-token-0000'] }),
        snapshot({ retainedTokenIds: ['p-token-0000', 'p-token-0001'] })
      )
    ).toBe(false);
  });
});
