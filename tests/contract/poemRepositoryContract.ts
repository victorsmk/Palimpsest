import { describe, it, expect } from 'vitest';
import type { PoemRepository } from '@/lib/repositories';
import { PoemConflictError, PoemGoneError, type Poem, type PoemDraft } from '@/lib/models';

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
  schemaVersion: 2, revision: 1,
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

/** The content of a poem, as a writer would supply it: no id, times or revision. */
export const draftOf = (p: Poem): PoemDraft => {
  const { id, schemaVersion, revision, createdAt, updatedAt, ...content } = p;
  void id; void schemaVersion; void revision; void createdAt; void updatedAt;
  return content;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

    describe('creating a poem', () => {
      it('assigns the id, both times and revision 1, and returns the poem as stored', async () => {
        const { repo } = await make();
        const before = Date.now();
        const made = await repo.create(draftOf(poem('x')));
        const after = Date.now();
        expect(made.id).toMatch(UUID);
        expect(made).toMatchObject({ schemaVersion: 2, revision: 1, title: 'Poem x', erasureStyle: 'blackout' });
        expect(made.createdAt).toBe(made.updatedAt);
        expect(new Date(made.createdAt).getTime()).toBeGreaterThanOrEqual(before);
        expect(new Date(made.createdAt).getTime()).toBeLessThanOrEqual(after);
        expect(await repo.get(made.id)).toEqual(made);
      });

      it('gives every poem its own id', async () => {
        const { repo } = await make();
        const ids = new Set([(await repo.create(draftOf(poem('a')))).id, (await repo.create(draftOf(poem('a')))).id, (await repo.create(draftOf(poem('a')))).id]);
        expect(ids.size).toBe(3);
        expect(await repo.list()).toHaveLength(3);
      });

      it('does not let the caller choose the id, the times or the revision, even by passing a whole poem', async () => {
        const { repo } = await make();
        const made = await repo.create(poem('chosen', { revision: 7, createdAt: '2001-01-01T00:00:00.000Z', updatedAt: '2001-01-02T00:00:00.000Z' }));
        expect(made.id).not.toBe('chosen');
        expect(made.revision).toBe(1);
        expect(made.createdAt).not.toBe('2001-01-01T00:00:00.000Z');
        expect(made.updatedAt).not.toBe('2001-01-02T00:00:00.000Z');
        expect(await repo.get('chosen')).toBeNull();
      });

      it('keeps every field, including a missing title or notes as missing', async () => {
        const { repo } = await make();
        const bare = draftOf(poem('bare'));
        delete bare.title;
        delete bare.notes;
        const made = await repo.create(bare);
        const back = (await repo.get(made.id))!;
        expect(back).toEqual(made);
        expect('title' in back).toBe(false);
        expect('notes' in back).toBe(false);
        expect('passageVersion' in back).toBe(false);
      });

      it('keeps the passage version when there is one', async () => {
        const { repo } = await make();
        const made = await repo.create({ ...draftOf(poem('v')), passageVersion: 't1-0123456789abcdef' });
        expect((await repo.get(made.id))!.passageVersion).toBe('t1-0123456789abcdef');
      });

      it('keeps text of any kind exactly: accents, symbols, other scripts, line breaks, long notes', async () => {
        const { repo } = await make();
        const text = draftOf(poem('text', { title: 'Café “quotes” 詩 <b>x</b> 100%', notes: `line one\nline two\n${'long '.repeat(2000)}` }));
        const made = await repo.create(text);
        expect(await repo.get(made.id)).toMatchObject(text);
      });

      it('keeps the order of the kept words and of the breaks', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('o', { retainedTokenIds: ['t-3', 't-1', 't-2'], lineBreaks: ['t-2', 't-3'] })));
        const back = (await repo.get(made.id))!;
        expect(back.retainedTokenIds).toEqual(['t-3', 't-1', 't-2']);
        expect(back.lineBreaks).toEqual(['t-2', 't-3']);
      });

      it('holds a poem of thousands of words', async () => {
        const { repo } = await make();
        const words = Array.from({ length: 5000 }, (_, i) => `w-${i}`);
        const made = await repo.create(draftOf(poem('big', { retainedTokenIds: words, lineBreaks: [words[10]] })));
        expect((await repo.get(made.id))!.retainedTokenIds).toHaveLength(5000);
      });
    });

    describe('copies, never shared objects', () => {
      it('is not changed by changing the draft that was saved, or the poem that came back', async () => {
        const { repo } = await make();
        const draft = draftOf(poem('a'));
        const made = await repo.create(draft);
        draft.title = 'Changed after saving';
        draft.retainedTokenIds.push('walden-woods-token-9999');
        made.title = 'Changed after creating';
        made.lineBreaks.length = 0;
        expect(await repo.get(made.id)).toMatchObject(draftOf(poem('a')));
      });

      it('is not changed by changing a poem that was read or listed', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        const read = (await repo.get(made.id))!;
        read.title = 'Changed after reading';
        read.lineBreaks.length = 0;
        const [listed] = await repo.list();
        listed.title = 'Changed after listing';
        expect(await repo.get(made.id)).toEqual(made);
      });

      it('is not changed by changing a poem that an update returned', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        const updated = await repo.update(made.id, draftOf(poem('a', { title: 'Two' })), 1);
        updated.retainedTokenIds.length = 0;
        expect((await repo.get(made.id))!.retainedTokenIds).toHaveLength(3);
      });
    });

    describe('updating a poem', () => {
      it('replaces the content, adds one to the revision, and keeps the id and creation time', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a', { title: 'First' })));
        const updated = await repo.update(made.id, draftOf(poem('a', { title: 'Second', erasureStyle: 'faded' })), made.revision);
        expect(updated).toMatchObject({ id: made.id, revision: 2, createdAt: made.createdAt, title: 'Second', erasureStyle: 'faded', schemaVersion: 2 });
        expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(made.updatedAt).getTime());
        expect(await repo.get(made.id)).toEqual(updated);
        expect(await repo.list()).toHaveLength(1);
      });

      it('goes on counting: the revision it returns is the one to start the next update from', async () => {
        const { repo } = await make();
        let current = await repo.create(draftOf(poem('a')));
        for (let i = 2; i <= 5; i++) {
          current = await repo.update(current.id, draftOf(poem('a', { title: `T${i}` })), current.revision);
          expect(current.revision).toBe(i);
        }
        expect((await repo.get(current.id))!.title).toBe('T5');
      });

      it('does not let the caller change the id, the creation time or the revision', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        const updated = await repo.update(made.id, poem('other', { revision: 99, createdAt: '2001-01-01T00:00:00.000Z', title: 'Kept title' }), made.revision);
        expect(updated).toMatchObject({ id: made.id, revision: 2, createdAt: made.createdAt, title: 'Kept title' });
        expect(await repo.get('other')).toBeNull();
        expect(await repo.list()).toHaveLength(1);
      });

      it('keeps the passage version if the new content says none, and replaces it if it says one', async () => {
        const { repo } = await make();
        const made = await repo.create({ ...draftOf(poem('a')), passageVersion: 't1-aaaaaaaaaaaaaaaa' });
        const kept = await repo.update(made.id, draftOf(poem('a', { title: 'No version' })), 1);
        expect(kept.passageVersion).toBe('t1-aaaaaaaaaaaaaaaa');
        const replaced = await repo.update(made.id, { ...draftOf(poem('a')), passageVersion: 't1-bbbbbbbbbbbbbbbb' }, 2);
        expect(replaced.passageVersion).toBe('t1-bbbbbbbbbbbbbbbb');
      });

      it('leaves every other poem alone', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a'), poem('b'), poem('c')]);
        await repo.update('b', draftOf(poem('b', { title: 'Changed' })), 1);
        expect(await repo.get('a')).toEqual(poem('a'));
        expect(await repo.get('c')).toEqual(poem('c'));
      });
    });

    describe('updating from a revision that is out of date', () => {
      it('is refused with a conflict that carries the poem as stored, and stores nothing', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a', { title: 'Mine' })));
        const theirs = await repo.update(made.id, draftOf(poem('a', { title: 'Theirs' })), made.revision);

        const attempt = repo.update(made.id, draftOf(poem('a', { title: 'Mine, edited' })), made.revision);
        await expect(attempt).rejects.toBeInstanceOf(PoemConflictError);
        const error = (await attempt.catch(e => e)) as PoemConflictError;
        expect(error.current).toEqual(theirs);
        expect(error.message).toMatch(/changed somewhere else/);
        expect(await repo.get(made.id)).toEqual(theirs);
      });

      it('is refused for a revision from the future too', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        await expect(repo.update(made.id, draftOf(poem('a')), made.revision + 1)).rejects.toBeInstanceOf(PoemConflictError);
        expect((await repo.get(made.id))!.revision).toBe(1);
      });

      it('can be tried again from the revision the conflict named', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        await repo.update(made.id, draftOf(poem('a', { title: 'Theirs' })), 1);
        const error = (await repo.update(made.id, draftOf(poem('a', { title: 'Mine' })), 1).catch(e => e)) as PoemConflictError;
        const retried = await repo.update(made.id, draftOf(poem('a', { title: 'Mine' })), error.current.revision);
        expect(retried).toMatchObject({ revision: 3, title: 'Mine' });
      });

      it('lets only one of two saves from the same revision win', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        const results = await Promise.allSettled([
          repo.update(made.id, draftOf(poem('a', { title: 'One' })), 1),
          repo.update(made.id, draftOf(poem('a', { title: 'Two' })), 1),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
        expect((await repo.get(made.id))!.revision).toBe(2);
      });
    });

    describe('updating a poem that is not there', () => {
      it('says it is gone, and does not create it', async () => {
        const { repo } = await make();
        await expect(repo.update('nothing', draftOf(poem('x')), 1)).rejects.toBeInstanceOf(PoemGoneError);
        expect(await repo.list()).toEqual([]);
      });

      it('says so for a poem that was deleted after it was opened, and does not bring it back', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        await repo.delete(made.id);
        await expect(repo.update(made.id, draftOf(poem('a')), made.revision)).rejects.toBeInstanceOf(PoemGoneError);
        expect(await repo.get(made.id)).toBeNull();
        expect(await repo.list()).toEqual([]);
      });
    });

    describe('listing', () => {
      it('lists every poem once, whatever the order', async () => {
        const { repo } = await make();
        await repo.importMany([poem('c'), poem('a'), poem('b')]);
        expect((await repo.list()).sort(byId)).toEqual([poem('a'), poem('b'), poem('c')]);
      });

      it('lists nothing that was deleted', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a'), poem('b')]);
        await repo.delete('a');
        expect((await repo.list()).map(p => p.id)).toEqual(['b']);
      });
    });

    describe('deleting', () => {
      it('removes only that poem, and deleting it again is fine', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a'), poem('b')]);
        await repo.delete('a');
        await repo.delete('a');
        expect(await repo.get('a')).toBeNull();
        expect(await repo.get('b')).toEqual(poem('b'));
      });
    });

    describe('importing many at once', () => {
      it('stores them all exactly as they are: ids, times and revisions are kept', async () => {
        const { repo } = await make();
        const many = Array.from({ length: 100 }, (_, i) => poem(`p${i}`, { revision: i + 1, createdAt: `2025-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z` }));
        await repo.importMany(many);
        expect(await repo.list()).toHaveLength(100);
        expect(await repo.get('p42')).toEqual(many[42]);
      });

      it('gives back what was imported, not the same objects', async () => {
        const { repo } = await make();
        const original = poem('a');
        await repo.importMany([original]);
        original.title = 'Changed after importing';
        original.retainedTokenIds.push('x');
        expect(await repo.get('a')).toEqual(poem('a'));
      });

      it('can then be updated from the revision it came with', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a', { revision: 4 })]);
        await expect(repo.update('a', draftOf(poem('a')), 1)).rejects.toBeInstanceOf(PoemConflictError);
        expect((await repo.update('a', draftOf(poem('a')), 4)).revision).toBe(5);
      });

      it('stores nothing at all, if it cannot store them', async () => {
        const { repo, failWrites, allowWrites } = await make();
        await repo.importMany([poem('existing')]);
        failWrites();
        await expect(repo.importMany([poem('x'), poem('y')])).rejects.toThrow();
        allowWrites();
        expect((await repo.list()).map(p => p.id)).toEqual(['existing']);
      });

      it('refuses a poem whose id is already stored, and stores none of the others', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a', { title: 'Mine' })]);
        await expect(repo.importMany([poem('b'), poem('a', { title: 'Theirs' })])).rejects.toThrow(/already stored/);
        expect((await repo.list()).map(p => p.id)).toEqual(['a']);
        expect((await repo.get('a'))!.title).toBe('Mine');
      });

      it('refuses the same id twice in one list', async () => {
        const { repo } = await make();
        await expect(repo.importMany([poem('a'), poem('a')])).rejects.toThrow(/already stored/);
        expect(await repo.list()).toEqual([]);
      });

      it('does nothing for an empty list', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a')]);
        await repo.importMany([]);
        expect(await repo.list()).toHaveLength(1);
      });
    });

    describe('a failed write', () => {
      it('is reported by create, update and delete, and leaves what was stored as it was', async () => {
        const { repo, failWrites, allowWrites } = await make();
        const made = await repo.create(draftOf(poem('a')));
        failWrites();
        await expect(repo.create(draftOf(poem('b')))).rejects.toThrow();
        await expect(repo.update(made.id, draftOf(poem('a', { title: 'Lost' })), 1)).rejects.toThrow();
        await expect(repo.delete(made.id)).rejects.toThrow();
        allowWrites();
        expect(await repo.list()).toEqual([made]);
      });
    });

    describe('ids', () => {
      it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', 'a.b-c_d:1'])('keeps an imported poem called %j like any other', async id => {
        const { repo } = await make();
        await repo.importMany([poem(id)]);
        expect(await repo.get(id)).toEqual(poem(id));
        expect((await repo.list()).map(p => p.id)).toEqual([id]);
        expect((await repo.update(id, draftOf(poem(id)), 1)).revision).toBe(2);
      });

      it('refuses a poem called "__proto__", which is not an ordinary key everywhere, and stores nothing', async () => {
        const { repo } = await make();
        await expect(repo.importMany([poem('__proto__')])).rejects.toThrow();
        await expect(repo.importMany([poem('fine'), poem('__proto__')])).rejects.toThrow();
        expect(await repo.list()).toEqual([]);
        expect(({} as Record<string, unknown>).passageId).toBeUndefined(); // nothing leaked into every object
      });

      it('does not find, or update, a poem for a name that is only a property of every object', async () => {
        const { repo } = await make();
        for (const name of ['constructor', '__proto__', 'toString']) {
          expect(await repo.get(name)).toBeNull();
          await expect(repo.update(name, draftOf(poem('x')), 1)).rejects.toBeInstanceOf(PoemGoneError);
        }
        expect(await repo.list()).toEqual([]);
      });
    });
  });
}
