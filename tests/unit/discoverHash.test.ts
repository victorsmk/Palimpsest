import { describe, it, expect } from 'vitest';
import { discoverHash, discoverHref, readDiscoverPassage } from '@/lib/handoff';
import { bundledPassages } from '@/lib/library/bundled';

describe('which passage Discover shows, from the URL hash', () => {
  it('builds the link and the hash for a passage', () => {
    expect(discoverHref('walden-woods')).toBe('/discover#passage=walden-woods');
    expect(discoverHash('walden-woods')).toBe('#passage=walden-woods');
  });

  it('finds the passage a hash names, with or without the #', () => {
    expect(readDiscoverPassage('#passage=walden-woods', bundledPassages)?.id).toBe('walden-woods');
    expect(readDiscoverPassage('passage=dorian-gray-ch1', bundledPassages)?.id).toBe('dorian-gray-ch1');
  });

  it('round-trips every passage in the library', () => {
    for (const passage of bundledPassages) {
      expect(readDiscoverPassage(discoverHash(passage.id), bundledPassages)).toBe(passage);
    }
  });

  it.each([
    ['empty', ''],
    ['only a #', '#'],
    ['a passage that is not in the library', '#passage=no-such-book'],
    ['another key', '#poem=walden-woods'],
    ['a skip-link hash', '#main'],
    ['a Studio hand-off', '#found=walden-woods:14-28:16,23'],
    ['upper case', '#passage=Walden-Woods'],
    ['path characters', '#passage=../walden-woods'],
    ['trailing text', '#passage=walden-woods&x=1'],
    ['spaces', '#passage=walden woods'],
    ['an empty id', '#passage='],
    ['an over-long id', `#passage=${'a'.repeat(80)}`],
  ])('names no passage for %s', (_name, hash) => {
    expect(readDiscoverPassage(hash, bundledPassages)).toBeNull();
  });
});
