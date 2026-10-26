import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PostgresPoemRepository } from '@/lib/server/PostgresPoemRepository';
import { LIMITS, PoemLimitError, PoemGoneError, RepositoryError, UnavailableError } from '@/lib/models';
import { createTestDb } from '../helpers/pgliteDb';
import { draftOf, poem } from '../contract/poemRepositoryContract';

// What the server's repository does beyond the contract every repository keeps: it holds many users'
// poems in one table, and it applies the collection limit itself.

const db = await createTestDb();
afterAll(() => db.close());

const repoFor = () => new PostgresPoemRepository(db, crypto.randomUUID());
const many = (n: number, from = 0) => Array.from({ length: n }, (_, i) => poem(`p${from + i}`));

describe('one user can never reach another user’s poems', () => {
  it('sees none of them, however they ask', async () => {
    const alice = repoFor();
    const bob = repoFor();
    await alice.importMany([poem('a'), poem('b')]);
    expect(await bob.get('a')).toBeNull();
    expect(await bob.getMany(['a', 'b'])).toEqual([]);
    expect(await bob.count()).toBe(0);
    expect((await bob.list()).items).toEqual([]);
    expect((await bob.listSummaries()).items).toEqual([]);
    expect(await alice.count()).toBe(2);
  });

  it('cannot change or delete them, and is told the poem is not there', async () => {
    const alice = repoFor();
    const bob = repoFor();
    await alice.importMany([poem('a', { title: 'Alice’s' })]);
    await expect(bob.update('a', draftOf(poem('a', { title: 'Bob’s' })), 1)).rejects.toBeInstanceOf(PoemGoneError);
    await bob.delete('a');
    expect(await alice.get('a')).toMatchObject({ title: 'Alice’s', revision: 1 });
  });

  it('can each have a poem with the same id, without either knowing', async () => {
    const alice = repoFor();
    const bob = repoFor();
    await alice.importMany([poem('same', { title: 'Alice’s' })]);
    await bob.importMany([poem('same', { title: 'Bob’s' })]);
    await alice.update('same', draftOf(poem('same', { title: 'Alice’s, changed' })), 1);
    expect(await alice.get('same')).toMatchObject({ title: 'Alice’s, changed', revision: 2 });
    expect(await bob.get('same')).toMatchObject({ title: 'Bob’s', revision: 1 });
  });

  it('pages only its own poems', async () => {
    const alice = repoFor();
    const bob = repoFor();
    await alice.importMany(many(7));
    await bob.importMany(many(3, 100));
    const seen: string[] = [];
    let after: string | undefined;
    do {
      const page = await alice.listSummaries({ after, limit: 2 });
      seen.push(...page.items.map(s => s.id));
      after = page.next ?? undefined;
    } while (after !== undefined);
    expect(seen.sort()).toEqual(many(7).map(p => p.id).sort());
  });
});

describe('the collection limit', () => {
  it('is applied by the repository: a create at the limit is refused, one below it is not', async () => {
    const repo = repoFor();
    await repo.importMany(many(LIMITS.poemsMax - 1));
    await expect(repo.create(draftOf(poem('x')))).resolves.toMatchObject({ revision: 1 });
    const refused = repo.create(draftOf(poem('y')));
    await expect(refused).rejects.toBeInstanceOf(PoemLimitError);
    await expect(refused).rejects.toThrow('Your collection is full: it can hold up to 2,000 poems.');
    expect(await repo.count()).toBe(LIMITS.poemsMax);
  });

  it('refuses an import that would pass it, and stores none of it', async () => {
    const repo = repoFor();
    await repo.importMany(many(LIMITS.poemsMax - 3));
    await expect(repo.importMany(many(4, 5000))).rejects.toBeInstanceOf(PoemLimitError);
    expect(await repo.count()).toBe(LIMITS.poemsMax - 3);
    await repo.importMany(many(3, 5000));
    expect(await repo.count()).toBe(LIMITS.poemsMax);
  });

  it('still lets a full collection update and delete its poems', async () => {
    const repo = repoFor();
    await repo.importMany(many(LIMITS.poemsMax));
    await expect(repo.update('p0', draftOf(poem('p0', { title: 'Edited' })), 1)).resolves.toMatchObject({ title: 'Edited' });
    await repo.delete('p1');
    await expect(repo.create(draftOf(poem('room')))).resolves.toBeDefined();
  });

  it('lets only as many through as there is room for when saves race', async () => {
    const repo = repoFor();
    await repo.importMany(many(LIMITS.poemsMax - 2));
    const results = await Promise.allSettled([1, 2, 3, 4].map(i => repo.create(draftOf(poem(`race${i}`)))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2);
    expect(await repo.count()).toBe(LIMITS.poemsMax);
  });
});

describe('what goes in comes out the same', () => {
  it('keeps the times exactly as written, and orders by the moment they name', async () => {
    const repo = repoFor();
    await repo.importMany([
      poem('plain', { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }),
      poem('offset', { createdAt: '2026-01-01T05:00:00+05:00', updatedAt: '2026-01-02T05:00:00.500+05:00' }),
    ]);
    expect(await repo.get('plain')).toMatchObject({ createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' });
    expect(await repo.get('offset')).toMatchObject({ updatedAt: '2026-01-02T05:00:00.500+05:00' });
    // 00:00:00.500 UTC on the 2nd is later than 00:00:00 UTC on the 2nd.
    expect((await repo.listSummaries()).items.map(s => s.id)).toEqual(['offset', 'plain']);
  });

  it('tells an empty title or notes from none', async () => {
    const repo = repoFor();
    const bare = poem('bare');
    delete bare.title;
    delete bare.notes;
    await repo.importMany([bare, poem('empty', { title: '', notes: '' })]);
    const got = (await repo.get('bare'))!;
    expect('title' in got || 'notes' in got).toBe(false);
    expect(await repo.get('empty')).toMatchObject({ title: '', notes: '' });
  });

  it('holds the longest poem the limits allow', async () => {
    const repo = repoFor();
    const words = Array.from({ length: LIMITS.retainedMax }, (_, i) => `walden-woods-token-${String(i).padStart(5, '0')}`);
    const made = await repo.create(draftOf(poem('long', { retainedTokenIds: words, lineBreaks: [words[5]], notes: 'n'.repeat(LIMITS.notesMax) })));
    const back = (await repo.get(made.id))!;
    expect(back.retainedTokenIds).toEqual(words);
    expect(back.notes).toHaveLength(LIMITS.notesMax);
    expect((await repo.listSummaries()).items[0].wordCount).toBe(LIMITS.retainedMax);
  });

  it('keeps text of every kind, quotes and SQL included, as data', async () => {
    const repo = repoFor();
    const odd = "Robert'); drop table poems;-- “quotes” 詩 \\ 100% $1 \n tab\t";
    const made = await repo.create(draftOf(poem('odd', { title: odd, notes: odd })));
    expect(await repo.get(made.id)).toMatchObject({ title: odd, notes: odd });
    expect(await repo.count()).toBe(1);
  });
});

describe('failures', () => {
  it('a database that fails is an UnavailableError with the cause attached, and nothing is stored', async () => {
    const test = await createTestDb();
    const failing = new PostgresPoemRepository(test, crypto.randomUUID());
    test.failWrites();
    const caught = await failing.create(draftOf(poem('x'))).catch(e => e);
    expect(caught).toBeInstanceOf(UnavailableError);
    expect((caught.cause as Error).message).toBe('connection lost');
    test.allowWrites();
    expect(await failing.count()).toBe(0);
    await test.close();
  });

  it('an import with one bad poem stores none of the others', async () => {
    const repo = repoFor();
    const bad = { ...poem('bad'), erasureStyle: 'bogus' } as unknown as ReturnType<typeof poem>;
    const caught = await repo.importMany([poem('good1'), poem('good2'), bad]).catch(e => e);
    expect(caught).toBeInstanceOf(RepositoryError);
    expect(await repo.count()).toBe(0);
  });

  it('text the database cannot hold (a NUL character) fails cleanly and stores nothing', async () => {
    const repo = repoFor();
    const caught = await repo.create(draftOf(poem('nul', { title: 'a\u0000b' }))).catch(e => e);
    expect(caught).toBeInstanceOf(RepositoryError);
    expect(await repo.count()).toBe(0);
  });
});

describe('the schema', () => {
  it('can be run again on a database that already has it, without harm', async () => {
    const repo = repoFor();
    await repo.importMany([poem('a')]);
    await db.exec(readFileSync('db/schema.sql', 'utf-8'));
    expect(await repo.count()).toBe(1);
  });
});
