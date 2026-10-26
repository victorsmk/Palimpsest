import { describe, it, expect, vi } from 'vitest';
import { BACKUP_FORMAT, planRestore, readBackup } from '@/lib/backup';
import { legacyPoemId } from '@/lib/models';
import { BrowserPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';
import { PoemService } from '@/lib/services';

const KEY = 'palimpsest:poems:v1';

/** A poem as version 1 of the app stored it: the browser's id, no revision, no passage version. */
const v1 = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  schemaVersion: 1,
  passageId: 'walden-woods',
  title: `Poem ${id}`,
  notes: 'notes',
  retainedTokenIds: ['walden-woods-token-0001', 'walden-woods-token-0003'],
  lineBreaks: ['walden-woods-token-0001'],
  erasureStyle: 'blackout',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

function setup(stored: Record<string, unknown>) {
  const storage = new MemoryStorageAdapter();
  storage.setItem(KEY, JSON.stringify(stored));
  const repo = new BrowserPoemRepository(storage);
  const raw = () => JSON.parse(storage.getItem(KEY) ?? '{}') as Record<string, Record<string, unknown>>;
  return { storage, repo, service: new PoemService(repo), raw };
}

const OLD = ['poem-1761390000000-k3j9a', 'poem-1761390001111-p0q1r'];
const legacyStore = () => Object.fromEntries(OLD.map(id => [id, v1(id)]));

describe('reading a collection saved by version 1', () => {
  it('lists every poem as version 2, under the id every poem now has, as revision 1, and with nothing else changed', async () => {
    const { repo } = setup(legacyStore());
    const poems = await repo.list();
    expect(poems.map(p => p.id).sort()).toEqual(OLD.map(legacyPoemId).sort());
    for (const old of OLD) {
      expect(await repo.get(legacyPoemId(old))).toEqual({ ...v1(old), id: legacyPoemId(old), schemaVersion: 2, revision: 1 });
    }
  });

  it('finds a poem by its new id and not by the old one', async () => {
    const { repo } = setup(legacyStore());
    expect(await repo.get(legacyPoemId(OLD[0]))).not.toBeNull();
    expect(await repo.get(OLD[0])).toBeNull();
  });

  it('writes nothing just by reading', async () => {
    const { repo, storage } = setup(legacyStore());
    const before = storage.getItem(KEY);
    const write = vi.spyOn(storage, 'setItem');
    await repo.list();
    await repo.get(legacyPoemId(OLD[0]));
    await repo.list();
    expect(write).not.toHaveBeenCalled();
    expect(storage.getItem(KEY)).toBe(before);
  });

  it('reads the same collection the same way every time, from any repository on the same storage', async () => {
    const { repo, storage } = setup(legacyStore());
    const other = new BrowserPoemRepository(storage);
    expect(await repo.list()).toEqual(await other.list());
    expect(await repo.list()).toEqual(await repo.list());
  });
});

describe('the first write after that', () => {
  it('stores the whole collection as version 2 under the new ids, and the old ids are gone', async () => {
    const { repo, raw, service } = setup(legacyStore());
    const added = await service.savePoem({ passageId: 'walden-woods', title: 'New', retainedTokenIds: ['walden-woods-token-0005'], lineBreaks: [], erasureStyle: 'faded' });

    const stored = raw();
    expect(Object.keys(stored).sort()).toEqual([...OLD.map(legacyPoemId), added.id].sort());
    for (const old of OLD) expect(stored[old]).toBeUndefined();
    for (const entry of Object.values(stored)) {
      expect(entry.schemaVersion).toBe(2);
      expect(entry.revision).toBe(1);
    }
    expect((await repo.list()).length).toBe(3);
  });

  it('saves an upgraded poem over itself: revision 2, the same id, one copy', async () => {
    const { service, raw } = setup(legacyStore());
    const id = legacyPoemId(OLD[0]);
    const again = await service.savePoem({ id, passageId: 'walden-woods', title: 'Edited', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' });
    expect(again).toMatchObject({ id, revision: 2, title: 'Edited', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(Object.keys(raw())).toHaveLength(2);
  });

  it('renames an upgraded poem: the same id, the next revision, and the rest as it was', async () => {
    const { service } = setup(legacyStore());
    const id = legacyPoemId(OLD[1]);
    const renamed = await service.renamePoem(id, 'Renamed');
    expect(renamed).toMatchObject({ id, revision: 2, title: 'Renamed', notes: 'notes', erasureStyle: 'blackout' });
  });

  it('deletes an upgraded poem by its new id, for good', async () => {
    const { service, raw } = setup(legacyStore());
    await service.deletePoem(legacyPoemId(OLD[0]));
    expect(Object.keys(raw())).toEqual([legacyPoemId(OLD[1])]);
  });

  it('is the same however many times it happens', async () => {
    const { service, raw, repo } = setup(legacyStore());
    await service.renamePoem(legacyPoemId(OLD[0]), 'Once');
    const afterFirst = raw();
    await service.renamePoem(legacyPoemId(OLD[0]), 'Once');
    expect(Object.keys(raw()).sort()).toEqual(Object.keys(afterFirst).sort());
    expect(await repo.list()).toHaveLength(2);
  });
});

describe('what the migration leaves alone', () => {
  it('keeps an entry it cannot read, and one stored under a name that is not its id, exactly as it was', async () => {
    const mismatched = v1('real-id');
    const { service, raw } = setup({ ...legacyStore(), junk: { not: 'a poem' }, 'wrong-key': mismatched, future: { ...v1('f'), schemaVersion: 99 } });
    await service.renamePoem(legacyPoemId(OLD[0]), 'Renamed'); // forces the write
    const stored = raw();
    expect(stored.junk).toEqual({ not: 'a poem' });
    expect(stored['wrong-key']).toEqual(mismatched);
    expect(stored.future).toMatchObject({ schemaVersion: 99 });
  });

  it('does not list what it kept', async () => {
    const { repo } = setup({ ...legacyStore(), junk: { not: 'a poem' }, 'wrong-key': v1('real-id') });
    expect(await repo.list()).toHaveLength(2);
  });

  it('keeps an old poem as it was stored, and shows the one already there, if the new id is taken', async () => {
    const taken = { ...v1('x'), id: legacyPoemId(OLD[0]), schemaVersion: 2, revision: 7, title: 'Already version 2' };
    const { repo, service, raw } = setup({ [OLD[0]]: v1(OLD[0]), [taken.id]: taken });
    expect((await repo.get(taken.id))!.title).toBe('Already version 2');
    expect(await repo.list()).toHaveLength(1);
    await service.renamePoem(taken.id, 'Still mine');
    expect(raw()[OLD[0]]).toEqual(v1(OLD[0])); // the old one is still there, untouched
  });

  it('upgrades a collection that holds version 1 and version 2 poems together', async () => {
    const modern = { ...v1('m'), id: 'b1d2c3e4-0000-4000-8000-000000000001', schemaVersion: 2, revision: 3 };
    const { repo } = setup({ ...legacyStore(), [modern.id]: modern });
    const poems = await repo.list();
    expect(poems).toHaveLength(3);
    expect(poems.find(p => p.id === modern.id)!.revision).toBe(3);
    expect(poems.filter(p => p.revision === 1)).toHaveLength(2);
  });
});

describe('saving a poem', () => {
  it('numbers each save: revision 1, then 2, then 3', async () => {
    const { service } = setup({});
    const first = await service.savePoem({ passageId: 'walden-woods', title: 'T', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' });
    const second = await service.savePoem({ id: first.id, passageId: 'walden-woods', title: 'T2', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' });
    const third = await service.savePoem({ id: first.id, passageId: 'walden-woods', title: 'T3', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' });
    expect([first.revision, second.revision, third.revision]).toEqual([1, 2, 3]);
  });

  it('records the passage version it is given, keeps it when a later save gives none, and replaces it when given a new one', async () => {
    const { service } = setup({});
    const input = { passageId: 'walden-woods', title: 'T', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' as const };
    const first = await service.savePoem({ ...input, passageVersion: 't1-ef42d4304c54bef5' });
    expect(first.passageVersion).toBe('t1-ef42d4304c54bef5');
    expect((await service.savePoem({ ...input, id: first.id })).passageVersion).toBe('t1-ef42d4304c54bef5');
    expect((await service.savePoem({ ...input, id: first.id, passageVersion: 't1-0123456789abcdef' })).passageVersion).toBe('t1-0123456789abcdef');
  });

  it('leaves a poem saved without any passage version without one', async () => {
    const { service } = setup({});
    const saved = await service.savePoem({ passageId: 'walden-woods', title: 'T', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' });
    expect('passageVersion' in saved).toBe(false);
  });

  it('gives every new poem, including a copy, an id of the same kind', async () => {
    const { service } = setup(legacyStore());
    const made = await service.savePoem({ passageId: 'walden-woods', title: 'T', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' });
    const copy = await service.duplicatePoem(made.id);
    const copyOfOld = await service.duplicatePoem(legacyPoemId(OLD[0]));
    for (const poem of [made, copy, copyOfOld, ...(await service.listPoems())]) {
      expect(poem.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('renames and copies a poem without losing the passage version it recorded', async () => {
    const { service } = setup({});
    const made = await service.savePoem({ passageId: 'walden-woods', title: 'T', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout', passageVersion: 't1-ef42d4304c54bef5' });
    expect((await service.renamePoem(made.id, 'Renamed')).passageVersion).toBe('t1-ef42d4304c54bef5');
    const copy = await service.duplicatePoem(made.id);
    expect(copy).toMatchObject({ revision: 1, passageVersion: 't1-ef42d4304c54bef5' });
  });
});

describe('a backup made by version 1', () => {
  const backupV1 = (poems: unknown[]) => JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-10-01T00:00:00.000Z', poems });

  it('is still readable, its poems upgraded the same way as stored ones', () => {
    const read = readBackup(backupV1(OLD.map(id => v1(id))));
    expect(read).toMatchObject({ ok: true, unreadable: 0, repeated: 0 });
    if (!read.ok) return;
    expect(read.poems.map(p => p.id).sort()).toEqual(OLD.map(legacyPoemId).sort());
    expect(read.poems.every(p => p.schemaVersion === 2 && p.revision === 1)).toBe(true);
  });

  it('adds nothing to a collection that already holds those poems, however they got there', async () => {
    const { service } = setup(legacyStore()); // migrated from version 1, and not changed since
    const read = readBackup(backupV1(OLD.map(id => v1(id))));
    if (!read.ok) throw new Error('unreadable');
    expect(planRestore(await service.listPoems(), read.poems)).toEqual({ toAdd: [], alreadyHere: 2, differentKept: 0 });
  });

  it('keeps the current version of one that has been edited since', async () => {
    const { service } = setup(legacyStore());
    await service.renamePoem(legacyPoemId(OLD[0]), 'Edited since');
    const read = readBackup(backupV1(OLD.map(id => v1(id))));
    if (!read.ok) throw new Error('unreadable');
    expect(planRestore(await service.listPoems(), read.poems)).toEqual({ toAdd: [], alreadyHere: 1, differentKept: 1 });
  });

  it('restores into an empty collection, and a second restore adds nothing', async () => {
    const { service } = setup({});
    const read = readBackup(backupV1(OLD.map(id => v1(id))));
    if (!read.ok) throw new Error('unreadable');
    expect((await service.restoreBackup(read.poems)).toAdd).toHaveLength(2);
    expect(await service.restoreBackup(read.poems)).toEqual({ toAdd: [], alreadyHere: 2, differentKept: 0 });
    expect((await service.listPoems()).map(p => p.id).sort()).toEqual(OLD.map(legacyPoemId).sort());
  });

  it.each([
    ['an id that is a property of every object', '__proto__'],
    ['an id with a path in it', '../../etc/passwd'],
    ['an id with spaces', 'two words'],
    ['an id with markup', '<img src=x>'],
  ])('leaves out a poem with %s, judging the id as written in the file', (_name, id) => {
    expect(readBackup(backupV1([v1(id)]))).toMatchObject({ ok: true, poems: [], unreadable: 1 });
  });

  it('is not changed by the order of its poems', () => {
    const a = readBackup(backupV1(OLD.map(id => v1(id))));
    const b = readBackup(backupV1([...OLD].reverse().map(id => v1(id))));
    expect(a.ok && b.ok && [...a.poems].sort((x, y) => (x.id < y.id ? -1 : 1))).toEqual(b.ok && [...b.poems].sort((x, y) => (x.id < y.id ? -1 : 1)));
  });
});
