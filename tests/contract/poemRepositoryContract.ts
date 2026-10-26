import { describe, it, expect } from 'vitest';
import type { PoemRepository } from '@/lib/repositories';
import type { Poem } from '@/lib/models';

/**
 * What every PoemRepository must do, whatever stores the poems behind it. Written once and run
 * against each implementation, so that a repository backed by a server is held to exactly what the
 * browser one is. If a rule here is wrong for a new implementation, change the rule here, on
 * purpose, and every implementation then has to follow.
 */
export interface PoemRepositoryUnderTest {
  repo: PoemRepository;
  /** Makes the next write fail the way a full or blocked store does. */
  failWrites(): void;
  /** Lets writes succeed again. */
  allowWrites(): void;
}

export const poem = (id: string, overrides: Partial<Poem> = {}): Poem => ({
  id,
  schemaVersion: 1,
  passageId: 'walden-woods',
  title: `Poem ${id}`,
  notes: 'some notes',
  retainedTokenIds: ['walden-woods-token-0001', 'walden-woods-token-0003', 'walden-woods-token-0005'],
  lineBreaks: ['walden-woods-token-0003'],
  erasureStyle: 'blackout',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const byId = (a: Poem, b: Poem) => (a.id < b.id ? -1 : 1);

export function runPoemRepositoryContract(name: string, make: () => PoemRepositoryUnderTest | Promise<PoemRepositoryUnderTest>) {
  describe(`PoemRepository contract: ${name}`, () => {
    describe('an empty collection', () => {
      it('lists nothing, finds nothing, and deleting nothing is fine', async () => {
        const { repo } = await make();
        expect(await repo.list()).toEqual([]);
        expect(await repo.get('missing')).toBeNull();
        await expect(repo.delete('missing')).resolves.toBeUndefined();
      });
    });

    describe('saving and finding a poem', () => {
      it('gives back exactly what was saved', async () => {
        const { repo } = await make();
        await repo.save(poem('a'));
        expect(await repo.get('a')).toEqual(poem('a'));
      });

      it('keeps every field, including a missing title or notes as missing', async () => {
        const { repo } = await make();
        const bare = poem('bare');
        delete bare.title;
        delete bare.notes;
        await repo.save(bare);
        const back = (await repo.get('bare'))!;
        expect(back).toEqual(bare);
        expect('title' in back).toBe(false);
        expect('notes' in back).toBe(false);
      });

      it('keeps text of any kind exactly: accents, symbols, other scripts, line breaks, long notes', async () => {
        const { repo } = await make();
        const text = poem('text', { title: 'Café “quotes” 詩 <b>x</b> 100%', notes: `line one\nline two\n${'long '.repeat(2000)}` });
        await repo.save(text);
        expect(await repo.get('text')).toEqual(text);
      });

      it('keeps the order of the kept words and of the breaks', async () => {
        const { repo } = await make();
        const ordered = poem('o', { retainedTokenIds: ['t-3', 't-1', 't-2'], lineBreaks: ['t-2', 't-3'] });
        await repo.save(ordered);
        const back = (await repo.get('o'))!;
        expect(back.retainedTokenIds).toEqual(['t-3', 't-1', 't-2']);
        expect(back.lineBreaks).toEqual(['t-2', 't-3']);
      });

      it('holds a poem of thousands of words', async () => {
        const { repo } = await make();
        const words = Array.from({ length: 5000 }, (_, i) => `w-${i}`);
        await repo.save(poem('big', { retainedTokenIds: words, lineBreaks: [words[10]] }));
        expect((await repo.get('big'))!.retainedTokenIds).toHaveLength(5000);
      });
    });

    describe('copies, never shared objects', () => {
      it('is not changed by changing the poem that was saved', async () => {
        const { repo } = await make();
        const original = poem('a');
        await repo.save(original);
        original.title = 'Changed after saving';
        original.retainedTokenIds.push('walden-woods-token-9999');
        expect(await repo.get('a')).toEqual(poem('a'));
      });

      it('is not changed by changing a poem that was read', async () => {
        const { repo } = await make();
        await repo.save(poem('a'));
        const read = (await repo.get('a'))!;
        read.title = 'Changed after reading';
        read.lineBreaks.length = 0;
        expect(await repo.get('a')).toEqual(poem('a'));
        const [listed] = await repo.list();
        listed.title = 'Changed after listing';
        expect(await repo.get('a')).toEqual(poem('a'));
      });
    });

    describe('saving over a poem', () => {
      it('replaces the poem with the same id, and keeps only one', async () => {
        const { repo } = await make();
        await repo.save(poem('a', { title: 'First' }));
        await repo.save(poem('a', { title: 'Second', erasureStyle: 'faded' }));
        expect(await repo.get('a')).toEqual(poem('a', { title: 'Second', erasureStyle: 'faded' }));
        expect(await repo.list()).toHaveLength(1);
      });

      it('leaves every other poem alone', async () => {
        const { repo } = await make();
        await repo.saveMany([poem('a'), poem('b'), poem('c')]);
        await repo.save(poem('b', { title: 'Changed' }));
        expect(await repo.get('a')).toEqual(poem('a'));
        expect(await repo.get('c')).toEqual(poem('c'));
      });
    });

    describe('listing', () => {
      it('lists every poem once, whatever the order', async () => {
        const { repo } = await make();
        await repo.saveMany([poem('c'), poem('a'), poem('b')]);
        expect((await repo.list()).sort(byId)).toEqual([poem('a'), poem('b'), poem('c')]);
      });

      it('lists nothing that was deleted', async () => {
        const { repo } = await make();
        await repo.saveMany([poem('a'), poem('b')]);
        await repo.delete('a');
        expect((await repo.list()).map(p => p.id)).toEqual(['b']);
      });
    });

    describe('deleting', () => {
      it('removes only that poem, and deleting it again is fine', async () => {
        const { repo } = await make();
        await repo.saveMany([poem('a'), poem('b')]);
        await repo.delete('a');
        await repo.delete('a');
        expect(await repo.get('a')).toBeNull();
        expect(await repo.get('b')).toEqual(poem('b'));
      });
    });

    describe('saving many at once', () => {
      it('stores them all', async () => {
        const { repo } = await make();
        const many = Array.from({ length: 100 }, (_, i) => poem(`p${i}`));
        await repo.saveMany(many);
        expect(await repo.list()).toHaveLength(100);
        expect(await repo.get('p42')).toEqual(poem('p42'));
      });

      it('stores nothing at all, if it cannot store them', async () => {
        const { repo, failWrites, allowWrites } = await make();
        await repo.save(poem('existing'));
        failWrites();
        await expect(repo.saveMany([poem('x'), poem('y')])).rejects.toThrow();
        allowWrites();
        expect((await repo.list()).map(p => p.id)).toEqual(['existing']);
      });

      it('replaces a poem that is already there, as a single save does', async () => {
        const { repo } = await make();
        await repo.save(poem('a', { title: 'Old' }));
        await repo.saveMany([poem('a', { title: 'New' }), poem('b')]);
        expect((await repo.get('a'))!.title).toBe('New');
        expect(await repo.list()).toHaveLength(2);
      });

      it('does nothing for an empty list', async () => {
        const { repo } = await make();
        await repo.save(poem('a'));
        await repo.saveMany([]);
        expect(await repo.list()).toHaveLength(1);
      });
    });

    describe('a failed write', () => {
      it('is reported, and leaves what was stored as it was', async () => {
        const { repo, failWrites, allowWrites } = await make();
        await repo.save(poem('a'));
        failWrites();
        await expect(repo.save(poem('a', { title: 'Lost' }))).rejects.toThrow();
        await expect(repo.delete('a')).rejects.toThrow();
        allowWrites();
        expect(await repo.get('a')).toEqual(poem('a'));
      });
    });

    describe('ids', () => {
      it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', 'a.b-c_d:1'])('keeps a poem called %j like any other', async id => {
        const { repo } = await make();
        await repo.save(poem(id));
        expect(await repo.get(id)).toEqual(poem(id));
        expect((await repo.list()).map(p => p.id)).toEqual([id]);
      });

      it('refuses a poem called "__proto__", which is not an ordinary key everywhere, and stores nothing', async () => {
        const { repo } = await make();
        await expect(repo.save(poem('__proto__'))).rejects.toThrow();
        await expect(repo.saveMany([poem('fine'), poem('__proto__')])).rejects.toThrow();
        expect(await repo.list()).toEqual([]);
        expect(({} as Record<string, unknown>).passageId).toBeUndefined(); // nothing leaked into every object
      });

      it('does not find a poem for a name that is only a property of every object', async () => {
        const { repo } = await make();
        expect(await repo.get('constructor')).toBeNull();
        expect(await repo.get('__proto__')).toBeNull();
        expect(await repo.get('toString')).toBeNull();
      });
    });
  });
}
