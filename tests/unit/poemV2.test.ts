import { describe, it, expect } from 'vitest';
import {
  POEM_SCHEMA_VERSION,
  TOKENIZER_VERSION,
  fingerprint,
  legacyPoemId,
  newId,
  passageVersionOf,
  uuidV5,
} from '@/lib/models';
import { parsePoem } from '@/lib/models/poemValidation';
import { parseStoredPoem } from '@/lib/models/poemValidation';
import { reopenPoem } from '@/lib/editor/reopen';
import { openSavedPoem } from '@/lib/poems/openSaved';
import { bundledPassages } from '@/lib/library/bundled';
import { tokenize } from '@/lib/tokenizer';
import type { Poem } from '@/lib/models';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('hashing and ids, against the published reference values', () => {
  it('fingerprints text as the first 64 bits of its SHA-1, including across blocks and the empty text', () => {
    expect(fingerprint('abc')).toBe('a9993e364706816a'); // FIPS 180 example
    expect(fingerprint('')).toBe('da39a3ee5e6b4b0d');
    expect(fingerprint('The quick brown fox jumps over the lazy dog')).toBe('2fd4e1c67a2d28fc');
    expect(fingerprint('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('84983e441c3bd26e'); // two blocks
  });

  it('makes name-based UUIDs (version 5) as RFC 4122 says', () => {
    const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    expect(uuidV5(DNS, 'python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
    expect(uuidV5(DNS, 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('refuses a namespace that is not a UUID', () => {
    expect(() => uuidV5('not-a-uuid', 'x')).toThrow('The namespace must be a UUID.');
  });

  it('makes random ids that are version 4 UUIDs and never repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const id = newId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(2000);
  });
});

describe('the id an older poem is given', () => {
  it('is a UUID, the same every time for the same old id, and different for different ones', () => {
    expect(legacyPoemId('poem-1761390000000-k3j9a')).toMatch(UUID);
    expect(legacyPoemId('poem-1761390000000-k3j9a')).toBe(legacyPoemId('poem-1761390000000-k3j9a'));
    expect(legacyPoemId('a')).not.toBe(legacyPoemId('b'));
  });

  it('is pinned: changing it would give every existing poem a different id', () => {
    expect(legacyPoemId('poem-1761390000000-k3j9a')).toBe('6ec0899d-aaca-5a77-9b3f-6407e2150a2f');
    expect(legacyPoemId('a')).toBe('3ac38d9e-b4d0-5ac7-9aeb-a42ffe1921d6');
    expect(legacyPoemId('b')).toBe('256e3d4b-5b03-5d31-8ff1-24aac04d36f2');
  });
});

describe('the version of a passage', () => {
  it('is the tokenizer\'s version and a fingerprint of the exact text', () => {
    expect(TOKENIZER_VERSION).toBe(1);
    expect(passageVersionOf({ sourceText: 'abc' })).toBe('t1-a9993e364706816a');
  });

  it('is the same for the same text, and different when a single character changes', () => {
    expect(passageVersionOf({ sourceText: 'I went to the woods' })).toBe(passageVersionOf({ sourceText: 'I went to the woods' }));
    expect(passageVersionOf({ sourceText: 'I went to the woods' })).not.toBe(passageVersionOf({ sourceText: 'I went to the wood' }));
    expect(passageVersionOf({ sourceText: 'I went to the woods' })).not.toBe(passageVersionOf({ sourceText: 'I went to the woods ' }));
  });

  it('is pinned for the bundled passages: if a text changes, poems made from it must be told', () => {
    const versions = Object.fromEntries(bundledPassages.map(p => [p.id, passageVersionOf(p)]));
    expect(versions).toEqual({
      'jane-eyre-ch1': 't1-d8fe34aa988810d2',
      'walden-woods': 't1-ef42d4304c54bef5',
      'dorian-gray-ch1': 't1-aeff692c57bb57c1',
    });
  });
});

describe('reading a poem of either version', () => {
  const v1 = {
    id: 'poem-1761390000000-k3j9a',
    schemaVersion: 1,
    passageId: 'walden-woods',
    title: 'Quiet Woods',
    notes: 'notes',
    retainedTokenIds: ['walden-woods-token-0001', 'walden-woods-token-0003'],
    lineBreaks: ['walden-woods-token-0001'],
    erasureStyle: 'faded',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
  const v2 = { ...v1, id: '5d9bde47-0bd9-4d1e-9a3a-6b1d2d6d7f10', schemaVersion: 2, revision: 4, passageVersion: 't1-ef42d4304c54bef5' };

  it('reads a version 1 poem as version 2: the id every poem has, revision 1, no passage version, all else as it was', () => {
    expect(parsePoem(v1)).toEqual({
      ...v1,
      id: legacyPoemId('poem-1761390000000-k3j9a'),
      schemaVersion: 2,
      revision: 1,
    });
    expect('passageVersion' in parsePoem(v1)!).toBe(false);
  });

  it('says which id a version 1 poem was stored under, and reads a version 2 poem as it is', () => {
    expect(parseStoredPoem(v1)).toMatchObject({ storedId: 'poem-1761390000000-k3j9a' });
    expect(parseStoredPoem(v2)).toMatchObject({ storedId: v2.id, poem: v2 });
  });

  it('reads the same version 1 poem the same way every time', () => {
    expect(parsePoem(v1)).toEqual(parsePoem(structuredClone(v1)));
  });

  it('ignores a revision or passage version written on a version 1 poem: it has none', () => {
    const odd = parsePoem({ ...v1, revision: 99, passageVersion: 't1-0000000000000000' })!;
    expect(odd.revision).toBe(1);
    expect('passageVersion' in odd).toBe(false);
  });

  it.each([
    ['no revision', { revision: undefined }],
    ['a revision of zero', { revision: 0 }],
    ['a negative revision', { revision: -1 }],
    ['a revision with a fraction', { revision: 1.5 }],
    ['a revision that is text', { revision: '1' }],
    ['a revision that is far too large', { revision: 2_000_000_000 }],
    ['a passage version that is not one', { passageVersion: 'abc' }],
    ['a passage version with the wrong length', { passageVersion: 't1-abcdef' }],
    ['a passage version that is a number', { passageVersion: 5 }],
    ['a passage version in capitals', { passageVersion: 't1-EF42D4304C54BEF5' }],
    ['a schema newer than this build understands', { schemaVersion: POEM_SCHEMA_VERSION + 1 }],
  ])('refuses a version 2 poem with %s', (_name, change) => {
    expect(parsePoem({ ...v2, ...change })).toBeNull();
  });

  it('accepts a version 2 poem with no passage version, as one made before it was recorded', () => {
    const { passageVersion, ...without } = v2;
    void passageVersion;
    expect(parsePoem(without)).toEqual(without);
  });
});

describe('opening a poem whose passage may have changed', () => {
  const text = 'Where the sea wild and grey meets sky and the wind comes in from far away.';
  const passage = { tokens: tokenize('p1', text), sourceText: text };
  const ids = passage.tokens.filter(t => t.isSelectable).map(t => t.id);
  const poem = (overrides: Partial<Poem> = {}): Poem => ({
    id: legacyPoemId('x'), schemaVersion: 2, revision: 1, passageId: 'p1', title: 'Sea', retainedTokenIds: [ids[1], ids[3]], lineBreaks: [],
    erasureStyle: 'blackout', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
  });

  it('opens when the version it recorded is the passage\'s version', () => {
    expect(reopenPoem(poem({ passageVersion: passageVersionOf(passage) }), passage)).toMatchObject({ ok: true });
  });

  it('refuses when the text has changed since, saying so, even though every word it keeps is still there', () => {
    const edited = { ...passage, sourceText: `${text} One more sentence.` }; // same words, different text
    expect(edited.tokens).toBe(passage.tokens);
    expect(reopenPoem(poem({ passageVersion: passageVersionOf(passage) }), edited)).toEqual({
      ok: false,
      reason: 'passage-changed',
      message: '"Sea" was made from an earlier version of this text, which has since changed, so it cannot be opened safely.',
    });
  });

  it('refuses when the tokenizer\'s version is not the one the poem was made with', () => {
    expect(reopenPoem(poem({ passageVersion: 't0-0123456789abcdef' }), passage)).toMatchObject({ ok: false, reason: 'passage-changed' });
  });

  it('checks a poem with no recorded version by its words alone, as before', () => {
    expect(reopenPoem(poem(), passage)).toMatchObject({ ok: true });
    expect(reopenPoem(poem({ retainedTokenIds: [ids[1], 'p1-token-9999'] }), passage)).toMatchObject({ ok: false, reason: 'token-mismatch' });
  });

  it('says the passage is missing before anything else', () => {
    expect(reopenPoem(poem({ passageVersion: 't1-0123456789abcdef' }), null)).toMatchObject({ ok: false, reason: 'passage-missing' });
  });

  it('reaches the screen: a saved poem of a changed text is refused with that message', async () => {
    const walden = bundledPassages.find(p => p.id === 'walden-woods')!;
    const kept = walden.tokens.filter(t => t.isSelectable).slice(14, 17).map(t => t.id);
    const saved = poem({ passageId: 'walden-woods', retainedTokenIds: kept, title: 'Stale', passageVersion: 't1-0123456789abcdef' });
    const result = await openSavedPoem(saved.id, bundledPassages, { getPoem: async () => saved });
    expect(result).toEqual({
      ok: false,
      message: '"Stale" was made from an earlier version of this text, which has since changed, so it cannot be opened safely.',
    });
  });

  it('opens a saved poem that recorded the current version', async () => {
    const walden = bundledPassages.find(p => p.id === 'walden-woods')!;
    const kept = walden.tokens.filter(t => t.isSelectable).slice(14, 17).map(t => t.id);
    const saved = poem({ passageId: 'walden-woods', retainedTokenIds: kept, passageVersion: passageVersionOf(walden) });
    expect(await openSavedPoem(saved.id, bundledPassages, { getPoem: async () => saved })).toMatchObject({ ok: true });
  });
});
