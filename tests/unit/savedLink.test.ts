import { describe, it, expect } from 'vitest';
import {
  FOUND_HANDOFF_INVALID_MESSAGE,
  SAVED_MISSING_MESSAGE,
  SAVED_UNREADABLE_MESSAGE,
  readOpenRequest,
  savedPoemHref,
} from '@/lib/handoff';
import { openSavedPoem } from '@/lib/poems/openSaved';
import { bundledPassages } from '@/lib/library/bundled';
import type { Poem } from '@/lib/models';

describe('a link to one of your saved poems', () => {
  it('is the Studio with the poem\'s id after "#open="', () => {
    expect(savedPoemHref('poem-1761390000000-k3j9a')).toBe('/studio#open=poem-1761390000000-k3j9a');
    expect(savedPoemHref('a', '/somewhere')).toBe('/somewhere#open=a');
  });

  it('is read back as the id, with or without the #', () => {
    expect(readOpenRequest('#open=poem-1761390000000-k3j9a')).toEqual({ kind: 'poem', id: 'poem-1761390000000-k3j9a' });
    expect(readOpenRequest('open=a.b_c:d-1')).toEqual({ kind: 'poem', id: 'a.b_c:d-1' });
  });

  it('round-trips every id the app makes', () => {
    for (const id of ['poem-1761390000000-k3j9a', 'poem-1-a', 'good', 'p1']) {
      const href = savedPoemHref(id);
      expect(readOpenRequest(href.slice(href.indexOf('#')))).toEqual({ kind: 'poem', id });
    }
  });

  it.each(['', '#', '#main', '#found=walden-woods:14-28:16,23', '#poem=walden-woods:3::b:', '#passage=walden-woods', '#open'])(
    'is not for the Studio to act on when the hash is %j',
    hash => {
      expect(readOpenRequest(hash)).toEqual({ kind: 'none' });
    }
  );

  it.each([
    ['no id', '#open='],
    ['a path', '#open=../../etc/passwd'],
    ['a path separator', '#open=a/b'],
    ['spaces', '#open=two words'],
    ['encoded characters', '#open=a%20b'],
    ['markup', '#open=<img src=x>'],
    ['a script', '#open=javascript:alert(1)'],
    ['more than one value', '#open=a&b=c'],
    ['a trailing space', '#open=abc '],
    ['a line break', '#open=a\nb'],
    ['the id that would be a property of every object', '#open=__proto__'],
    ['an id over 100 characters', `#open=${'a'.repeat(101)}`],
  ])('reports a link with %s as damaged', (_name, hash) => {
    expect(readOpenRequest(hash)).toEqual({ kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE });
  });

  it('allows an id of exactly 100 characters', () => {
    expect(readOpenRequest(`#open=${'a'.repeat(100)}`)).toEqual({ kind: 'poem', id: 'a'.repeat(100) });
  });
});

describe('opening a saved poem', () => {
  const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
  const poem = (overrides: Partial<Poem> = {}): Poem => ({
    id: 'a', schemaVersion: 1, passageId: 'walden-woods', title: 'Quiet Woods', notes: 'my notes', retainedTokenIds: ids(14, 28),
    lineBreaks: [ids(14, 28)[2], ids(14, 28)[9]], erasureStyle: 'faded', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...overrides,
  });
  const collectionOf = (...poems: Poem[]) => ({ getPoem: async (id: string) => poems.find(p => p.id === id) ?? null });

  it('gives the poem, its passage and an editor snapshot with everything it was saved with, notes too', async () => {
    const result = await openSavedPoem('a', bundledPassages, collectionOf(poem()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.poem.id).toBe('a');
    expect(result.passage.id).toBe('walden-woods');
    expect(result.snapshot).toEqual({
      retainedTokenIds: ids(14, 28),
      lineBreaks: [ids(14, 28)[2], ids(14, 28)[9]],
      erasureStyle: 'faded',
      title: 'Quiet Woods',
      notes: 'my notes',
    });
  });

  it('says plainly that a poem that is not in the collection is not there', async () => {
    expect(await openSavedPoem('gone', bundledPassages, collectionOf(poem()))).toEqual({ ok: false, message: SAVED_MISSING_MESSAGE });
  });

  it('refuses a poem whose book is no longer in the library, naming the poem', async () => {
    const result = await openSavedPoem('a', bundledPassages, collectionOf(poem({ passageId: 'vanished-book' })));
    expect(result).toEqual({ ok: false, message: '"Quiet Woods" was made from a passage that is no longer in the library.' });
  });

  it('refuses a poem that no longer matches its passage, and repairs nothing', async () => {
    const result = await openSavedPoem('a', bundledPassages, collectionOf(poem({ retainedTokenIds: ['walden-woods-token-9999'], lineBreaks: [] })));
    expect(result).toEqual({ ok: false, message: '"Quiet Woods" no longer matches the current text of its passage, so it cannot be opened safely.' });
  });

  it('says so, and does not throw, when the collection cannot be read', async () => {
    const broken = { getPoem: async () => { throw new Error('storage blocked'); } };
    expect(await openSavedPoem('a', bundledPassages, broken)).toEqual({ ok: false, message: SAVED_UNREADABLE_MESSAGE });
  });
});
