import { describe, it, expect } from 'vitest';
import type { PoemRepository } from '@/lib/repositories';
import { LIMITS, PoemConflictError, PoemGoneError, RepositoryError, type Poem, type PoemDraft } from '@/lib/models';

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

/** A write that could not be done: the place the poems are kept is full or blocked (storage), or cannot be reached (unavailable). */
const isWriteFailure = (error: unknown) => error instanceof RepositoryError && (error.code === 'storage' || error.code === 'unavailable');

const byId = (a: Poem, b: Poem) => (a.id < b.id ? -1 : 1);

/** Every poem in the repository, whole, by asking for page after page. */
async function all(repo: PoemRepository): Promise<Poem[]> {
  const poems: Poem[] = [];
  let after: string | undefined;
  do {
    const page = await repo.list({ after });
    poems.push(...page.items);
    after = page.next ?? undefined;
  } while (after !== undefined);
  return poems;
}

export function runPoemRepositoryContract(name: string, make: () => PoemRepositoryUnderTest | Promise<PoemRepositoryUnderTest>) {
  describe(`PoemRepository contract: ${name}`, () => {
    describe('an empty collection', () => {
      it('lists nothing, finds nothing, and deleting nothing is fine', async () => {
        const { repo } = await make();
        expect(await all(repo)).toEqual([]);
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
        expect(await all(repo)).toHaveLength(3);
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

      it('keeps text of any kind exactly: accents, symbols, other scripts, line breaks, notes near the limit', async () => {
        const { repo } = await make();
        const text = draftOf(poem('text', { title: 'Café “quotes” 詩 <b>x</b> 100%', notes: `line one\nline two\n${'long '.repeat(1900)}` }));
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
        const [listed] = await all(repo);
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
        expect(await all(repo)).toHaveLength(1);
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
        expect(await all(repo)).toHaveLength(1);
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
        expect(await all(repo)).toEqual([]);
      });

      it('says so for a poem that was deleted after it was opened, and does not bring it back', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('a')));
        await repo.delete(made.id);
        await expect(repo.update(made.id, draftOf(poem('a')), made.revision)).rejects.toBeInstanceOf(PoemGoneError);
        expect(await repo.get(made.id)).toBeNull();
        expect(await all(repo)).toEqual([]);
      });
    });

    describe('listing', () => {
      it('lists every poem once, whatever the order', async () => {
        const { repo } = await make();
        await repo.importMany([poem('c'), poem('a'), poem('b')]);
        expect((await all(repo)).sort(byId)).toEqual([poem('a'), poem('b'), poem('c')]);
      });

      it('lists nothing that was deleted', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a'), poem('b')]);
        await repo.delete('a');
        expect((await all(repo)).map(p => p.id)).toEqual(['b']);
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
        expect(await all(repo)).toHaveLength(100);
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
        await expect(repo.importMany([poem('x'), poem('y')])).rejects.toSatisfy(isWriteFailure);
        allowWrites();
        expect((await all(repo)).map(p => p.id)).toEqual(['existing']);
      });

      it('refuses a poem whose id is already stored, and stores none of the others', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a', { title: 'Mine' })]);
        await expect(repo.importMany([poem('b'), poem('a', { title: 'Theirs' })])).rejects.toThrow(/already stored/);
        expect((await all(repo)).map(p => p.id)).toEqual(['a']);
        expect((await repo.get('a'))!.title).toBe('Mine');
      });

      it('refuses the same id twice in one list', async () => {
        const { repo } = await make();
        await expect(repo.importMany([poem('a'), poem('a')])).rejects.toThrow(/already stored/);
        expect(await all(repo)).toEqual([]);
      });

      it('does nothing for an empty list', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a')]);
        await repo.importMany([]);
        expect(await all(repo)).toHaveLength(1);
      });
    });

    describe('a failed write', () => {
      it('is reported as a storage or unavailable error by create, update, delete and import, and leaves what was stored as it was', async () => {
        const { repo, failWrites, allowWrites } = await make();
        const made = await repo.create(draftOf(poem('a')));
        failWrites();
        await expect(repo.create(draftOf(poem('b')))).rejects.toSatisfy(isWriteFailure);
        await expect(repo.update(made.id, draftOf(poem('a', { title: 'Lost' })), 1)).rejects.toSatisfy(isWriteFailure);
        await expect(repo.delete(made.id)).rejects.toSatisfy(isWriteFailure);
        allowWrites();
        expect(await all(repo)).toEqual([made]);
      });
    });

    describe('ids', () => {
      it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', 'a.b-c_d:1'])('keeps an imported poem called %j like any other', async id => {
        const { repo } = await make();
        await repo.importMany([poem(id)]);
        expect(await repo.get(id)).toEqual(poem(id));
        expect((await all(repo)).map(p => p.id)).toEqual([id]);
        expect((await repo.update(id, draftOf(poem(id)), 1)).revision).toBe(2);
      });

      it('refuses a poem called "__proto__", which is not an ordinary key everywhere, and stores nothing', async () => {
        const { repo } = await make();
        await expect(repo.importMany([poem('__proto__')])).rejects.toThrow();
        await expect(repo.importMany([poem('fine'), poem('__proto__')])).rejects.toThrow();
        expect(await all(repo)).toEqual([]);
        expect(({} as Record<string, unknown>).passageId).toBeUndefined(); // nothing leaked into every object
      });

      it('does not find, or update, a poem for a name that is only a property of every object', async () => {
        const { repo } = await make();
        for (const name of ['constructor', '__proto__', 'toString']) {
          expect(await repo.get(name)).toBeNull();
          await expect(repo.update(name, draftOf(poem('x')), 1)).rejects.toBeInstanceOf(PoemGoneError);
        }
        expect(await all(repo)).toEqual([]);
      });
    });

    describe('counting and fetching several', () => {
      it('counts the poems stored, as they come and go', async () => {
        const { repo } = await make();
        expect(await repo.count()).toBe(0);
        await repo.importMany([poem('a'), poem('b')]);
        const made = await repo.create(draftOf(poem('x')));
        expect(await repo.count()).toBe(3);
        await repo.delete('a');
        await repo.delete(made.id);
        expect(await repo.count()).toBe(1);
      });

      it('gives the poems that are stored, whole, in the order asked for, and skips the rest', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a'), poem('b'), poem('c')]);
        expect(await repo.getMany(['c', 'nope', 'a'])).toEqual([poem('c'), poem('a')]);
        expect(await repo.getMany([])).toEqual([]);
        expect(await repo.getMany(['b', 'b', 'b'])).toEqual([poem('b')]);
        expect(await repo.getMany(['__proto__', 'constructor', 'toString'])).toEqual([]);
      });

      it('gives copies', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a')]);
        const [got] = await repo.getMany(['a']);
        got.title = 'Changed';
        got.retainedTokenIds.length = 0;
        expect(await repo.get('a')).toEqual(poem('a'));
      });
    });

    describe('summaries', () => {
      it('have what a list shows and none of the words or the notes', async () => {
        const { repo } = await make();
        await repo.importMany([poem('a', { passageVersion: 't1-0123456789abcdef', revision: 4 })]);
        const [summary] = (await repo.listSummaries()).items;
        expect(summary).toEqual({
          id: 'a',
          passageId: 'walden-woods',
          passageVersion: 't1-0123456789abcdef',
          revision: 4,
          title: 'Poem a',
          erasureStyle: 'blackout',
          wordCount: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          preview: { lines: [['walden-woods-token-0001', 'walden-woods-token-0003'], ['walden-woods-token-0005']], more: false },
        });
        expect('notes' in summary).toBe(false);
        expect('retainedTokenIds' in summary).toBe(false);
        expect('lineBreaks' in summary).toBe(false);
      });

      it('leave out a title or passage version the poem does not have', async () => {
        const { repo } = await make();
        const bare = poem('bare');
        delete bare.title;
        await repo.importMany([bare]);
        const [summary] = (await repo.listSummaries()).items;
        expect('title' in summary).toBe(false);
        expect('passageVersion' in summary).toBe(false);
      });

      it('stay small however long the poem is: the first lines only, and a count for the rest', async () => {
        const { repo } = await make();
        const words = Array.from({ length: 5000 }, (_, i) => `w-${i}`);
        await repo.importMany([poem('big', { retainedTokenIds: words, lineBreaks: [words[1], words[3], words[5], words[7]] })]);
        const [summary] = (await repo.listSummaries()).items;
        expect(summary.wordCount).toBe(5000);
        expect(summary.preview).toEqual({ lines: [['w-0', 'w-1'], ['w-2', 'w-3'], ['w-4', 'w-5']], more: true });
        expect(JSON.stringify(summary).length).toBeLessThan(1000);
      });

      it('follow every change: a create, an update, a delete', async () => {
        const { repo } = await make();
        const made = await repo.create(draftOf(poem('x', { title: 'First' })));
        expect((await repo.listSummaries()).items.map(s => [s.id, s.title, s.revision])).toEqual([[made.id, 'First', 1]]);
        await repo.update(made.id, draftOf(poem('x', { title: 'Second', retainedTokenIds: ['t-1'], lineBreaks: [] })), 1);
        const [after] = (await repo.listSummaries()).items;
        expect([after.title, after.revision, after.wordCount]).toEqual(['Second', 2, 1]);
        await repo.delete(made.id);
        expect((await repo.listSummaries()).items).toEqual([]);
      });
    });

    describe('listing in pages', () => {
      const stamp = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
      /** Poems changed one second apart: p000 the oldest. */
      const spread = (n: number) => Array.from({ length: n }, (_, i) => poem(`p${String(i).padStart(3, '0')}`, { updatedAt: stamp(i), createdAt: stamp(0) }));

      async function walkSummaries(repo: PoemRepository, limit?: number) {
        const items: string[] = [];
        let after: string | undefined;
        let pages = 0;
        do {
          const page = await repo.listSummaries({ after, limit });
          items.push(...page.items.map(s => s.id));
          after = page.next ?? undefined;
          if (++pages > 1000) throw new Error('The pages never end.');
        } while (after !== undefined);
        return { items, pages };
      }

      it('puts the most recently changed first, and orders those changed at the same moment by id', async () => {
        const { repo } = await make();
        const same = stamp(5);
        await repo.importMany([poem('b', { updatedAt: same }), poem('old', { updatedAt: stamp(1) }), poem('a', { updatedAt: same }), poem('new', { updatedAt: stamp(9) })]);
        expect((await repo.listSummaries()).items.map(s => s.id)).toEqual(['new', 'a', 'b', 'old']);
        expect((await repo.list()).items.map(p => p.id)).toEqual(['new', 'a', 'b', 'old']);
      });

      it('gives a page of the default size, with a way to ask for the next', async () => {
        const { repo } = await make();
        await repo.importMany(spread(LIMITS.pageDefault + 20));
        const first = await repo.listSummaries();
        expect(first.items).toHaveLength(LIMITS.pageDefault);
        expect(first.next).not.toBeNull();
        const second = await repo.listSummaries({ after: first.next! });
        expect(second.items).toHaveLength(20);
        expect(second.next).toBeNull();
      });

      it('walks the whole list in order, none missed and none twice, whatever the page size', async () => {
        const { repo } = await make();
        const poems = spread(23);
        await repo.importMany(poems);
        const newestFirst = poems.map(p => p.id).reverse();
        for (const limit of [1, 2, 5, 7, 22, 23, 24, 500]) expect((await walkSummaries(repo, limit)).items).toEqual(newestFirst);
      });

      it('ends exactly on the last item: a list that fills a page has no empty page after it', async () => {
        const { repo } = await make();
        await repo.importMany(spread(10));
        expect((await walkSummaries(repo, 5)).pages).toBe(2);
        expect((await repo.listSummaries({ limit: 10 })).next).toBeNull();
        expect((await repo.list({ limit: 10 })).next).toBeNull();
      });

      it('pages whole poems the same way', async () => {
        const { repo } = await make();
        const poems = spread(12);
        await repo.importMany(poems);
        const got: Poem[] = [];
        let after: string | undefined;
        do {
          const page = await repo.list({ after, limit: 5 });
          got.push(...page.items);
          after = page.next ?? undefined;
        } while (after !== undefined);
        expect(got).toEqual([...poems].reverse());
      });

      it('keeps a page size within bounds: too small, too large, or not a whole number', async () => {
        const { repo } = await make();
        await repo.importMany(spread(LIMITS.pageMax + 10));
        expect((await repo.listSummaries({ limit: 0 })).items).toHaveLength(1);
        expect((await repo.listSummaries({ limit: -5 })).items).toHaveLength(1);
        expect((await repo.listSummaries({ limit: 100_000 })).items).toHaveLength(LIMITS.pageMax);
        expect((await repo.listSummaries({ limit: 2.5 })).items).toHaveLength(LIMITS.pageDefault);
        expect((await repo.listSummaries({ limit: Number.NaN })).items).toHaveLength(LIMITS.pageDefault);
      });

      it('goes on from where a page ended, even if that poem has been deleted since', async () => {
        const { repo } = await make();
        await repo.importMany(spread(6));
        const first = await repo.listSummaries({ limit: 2 }); // p005, p004
        await repo.delete(first.items[1].id);
        const rest = await repo.listSummaries({ after: first.next!, limit: 10 });
        expect(rest.items.map(s => s.id)).toEqual(['p003', 'p002', 'p001', 'p000']);
      });

      it('loses and repeats nothing when poems are changed or added between pages', async () => {
        const { repo } = await make();
        await repo.importMany(spread(6));
        const first = await repo.listSummaries({ limit: 3 }); // p005, p004, p003
        // A poem further down is changed (it would now come first), and a brand new one is added.
        await repo.update('p001', draftOf(poem('p001', { title: 'Moved to the top' })), 1);
        await repo.importMany([poem('fresh', { updatedAt: stamp(100) })]);
        const rest = await repo.listSummaries({ after: first.next!, limit: 10 });
        expect(rest.items.map(s => s.id)).toEqual(['p002', 'p000']); // p001 moved above the cursor: not repeated
        expect(rest.items.some(s => first.items.some(f => f.id === s.id))).toBe(false);
      });

      it('ends a walk, not restarts it, when the cursor is not a position', async () => {
        const { repo } = await make();
        await repo.importMany(spread(3));
        for (const after of ['', 'nonsense', '|', 'x|y', '2026-01-01T00:00:00.000Z|', '__proto__']) {
          expect(await repo.listSummaries({ after })).toEqual({ items: [], next: null });
          expect(await repo.list({ after })).toEqual({ items: [], next: null });
        }
      });
    });
  });
}
