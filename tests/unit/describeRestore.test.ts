import { describe, it, expect } from 'vitest';
import { describeRestore } from '@/lib/backup';
import type { Poem } from '@/lib/models';

const stub = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }) as Poem);
const plan = (toAdd: number, alreadyHere = 0, differentKept = 0) => ({ toAdd: stub(toAdd), alreadyHere, differentKept });

describe('saying what a restore would do', () => {
  it('counts the poems in the file and says how many are new', () => {
    expect(describeRestore(3, plan(3), 0, 0)).toEqual({
      headline: 'This backup has 3 poems.',
      details: ['3 are new and will be added.'],
    });
  });

  it('uses the singular for one', () => {
    expect(describeRestore(1, plan(1), 0, 0)).toEqual({
      headline: 'This backup has 1 poem.',
      details: ['1 is new and will be added.'],
    });
  });

  it('says every part of a mixed backup, once, in a fixed order', () => {
    expect(describeRestore(9, plan(3, 2, 1), 2, 1).details).toEqual([
      '3 are new and will be added.',
      '2 are already in your collection.',
      '1 is a different version of a poem you already have, so yours is kept.',
      "2 can't be read and will be skipped.",
      '1 is repeated in the file and will be skipped.',
    ]);
  });

  it('says plainly that your own versions are kept when several differ', () => {
    expect(describeRestore(2, plan(0, 0, 2), 0, 0).details).toEqual([
      '2 are different versions of poems you already have, so yours are kept.',
    ]);
  });

  it('leaves out what does not apply, and says nothing is new when nothing is', () => {
    expect(describeRestore(4, plan(0, 4), 0, 0).details).toEqual(['4 are already in your collection.']);
    expect(describeRestore(1, plan(0, 1), 0, 0).details).toEqual(['1 is already in your collection.']);
    expect(describeRestore(0, plan(0), 0, 0)).toEqual({ headline: 'This backup has 0 poems.', details: [] });
  });
});
