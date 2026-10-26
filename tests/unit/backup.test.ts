import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_POEMS,
  backupFilename,
  createBackup,
  planRestore,
  readBackup,
  samePoem,
  serializeBackup,
} from '@/lib/backup';
import { PoemService } from '@/lib/services';
import { BrowserPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';
import { StorageError, type Poem } from '@/lib/models';

const poem = (id: string, overrides: Partial<Poem> = {}): Poem => ({
  id,
  schemaVersion: 2, revision: 1,
  passageId: 'walden-woods',
  title: `Poem ${id}`,
  notes: '',
  retainedTokenIds: ['walden-woods-token-0001', 'walden-woods-token-0003'],
  lineBreaks: ['walden-woods-token-0001'],
  erasureStyle: 'blackout',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const fileOf = (poems: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '2026-10-25T10:00:00.000Z', poems, ...extra });

describe('a backup file', () => {
  const now = new Date(2026, 9, 25, 14, 30); // 25 October 2026, local time

  it('holds the format, the version, when it was made, and every poem whole', () => {
    expect(createBackup([poem('a'), poem('b')], now)).toEqual({
      format: 'palimpsest-backup',
      version: 2,
      exportedAt: now.toISOString(),
      poems: [poem('a'), poem('b')],
    });
  });

  it('is named for the date, as it is where the writer is, with the month and day padded', () => {
    expect(backupFilename(now)).toBe('palimpsest-backup-2026-10-25.json');
    expect(backupFilename(new Date(2026, 0, 5, 23, 59))).toBe('palimpsest-backup-2026-01-05.json');
  });

  it('is indented text a person can open, and reads back as the same poems', () => {
    const text = serializeBackup(createBackup([poem('a')], now));
    expect(text).toContain('\n  "poems": [');
    expect(text.endsWith('}\n')).toBe(true);
    const read = readBackup(text);
    expect(read).toEqual({ ok: true, poems: [poem('a')], unreadable: 0, repeated: 0 });
  });

  it('can be empty', () => {
    expect(readBackup(serializeBackup(createBackup([], now)))).toEqual({ ok: true, poems: [], unreadable: 0, repeated: 0 });
  });
});

describe('reading a backup file', () => {
  it.each([
    ['text that is not JSON', 'palimpsest', 'not-json'],
    ['an empty file', '', 'not-json'],
    ['JSON that is a list', '[]', 'not-a-backup'],
    ['JSON that is a number', '7', 'not-a-backup'],
    ['JSON that is null', 'null', 'not-a-backup'],
    ['another kind of file', JSON.stringify({ format: 'something-else', version: 1, poems: [] }), 'not-a-backup'],
    ['no format', JSON.stringify({ version: 1, poems: [] }), 'not-a-backup'],
    ['no version', JSON.stringify({ format: BACKUP_FORMAT, poems: [] }), 'not-a-backup'],
    ['a version that is text', JSON.stringify({ format: BACKUP_FORMAT, version: '1', poems: [] }), 'not-a-backup'],
    ['version zero', JSON.stringify({ format: BACKUP_FORMAT, version: 0, poems: [] }), 'not-a-backup'],
    ['a version with a fraction', JSON.stringify({ format: BACKUP_FORMAT, version: 1.5, poems: [] }), 'not-a-backup'],
    ['no poems list', JSON.stringify({ format: BACKUP_FORMAT, version: 1 }), 'not-a-backup'],
    ['poems that are not a list', JSON.stringify({ format: BACKUP_FORMAT, version: 1, poems: { a: 1 } }), 'not-a-backup'],
  ])('refuses %s', (_name, text, reason) => {
    const read = readBackup(text);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe(reason);
  });

  it('says plainly that a backup from a newer version cannot be read', () => {
    const read = readBackup(fileOf([poem('a')], { version: BACKUP_VERSION + 1 }));
    expect(read).toEqual({ ok: false, reason: 'newer-version', message: expect.stringContaining('newer version') });
  });

  it('refuses a file over the size limit without parsing it', () => {
    const read = readBackup(' '.repeat(MAX_BACKUP_BYTES + 1));
    expect(read).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('counts size in bytes, not characters', () => {
    const read = readBackup('é'.repeat(MAX_BACKUP_BYTES / 2 + 1)); // two bytes each
    expect(read).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('refuses a backup with more poems than can be restored at once', () => {
    const read = readBackup(fileOf(Array.from({ length: MAX_BACKUP_POEMS + 1 }, (_, i) => poem(`p${i}`))));
    expect(read).toMatchObject({ ok: false, reason: 'too-many' });
    expect(readBackup(fileOf(Array.from({ length: MAX_BACKUP_POEMS }, (_, i) => poem(`p${i}`))))).toMatchObject({ ok: true });
  });

  it('keeps the poems that are well-formed and counts the ones that are not', () => {
    const read = readBackup(
      fileOf([
        poem('good'),
        { id: 'no-words' },
        'a string',
        null,
        7,
        poem('bad-style', { erasureStyle: 'sparkle' as never }),
        poem('bad-break', { lineBreaks: ['walden-woods-token-9999'] }), // a break after a word that is not kept
        poem('bad-date', { createdAt: 'yesterday' }),
        { ...poem('newer-schema'), schemaVersion: 99 },
      ])
    );
    expect(read).toMatchObject({ ok: true, unreadable: 8, repeated: 0 });
    if (read.ok) expect(read.poems.map(p => p.id)).toEqual(['good']);
  });

  it('keeps the first of a poem that appears twice and counts the repeat', () => {
    const read = readBackup(fileOf([poem('a', { title: 'First' }), poem('a', { title: 'Second' })]));
    expect(read).toMatchObject({ ok: true, repeated: 1 });
    if (read.ok) expect(read.poems.map(p => p.title)).toEqual(['First']);
  });

  it('drops fields it does not know, and keeps nothing a poem was not meant to carry', () => {
    const read = readBackup(fileOf([{ ...poem('a'), evil: '<script>', __extra: { deep: 1 } }]));
    expect(read.ok && read.poems[0]).toEqual(poem('a'));
    expect(read.ok && Object.keys(read.poems[0]).sort()).toEqual(
      ['createdAt', 'erasureStyle', 'id', 'lineBreaks', 'notes', 'passageId', 'retainedTokenIds', 'revision', 'schemaVersion', 'title', 'updatedAt']
    );
  });

  it.each([
    ['an id that would be a property of every object', '__proto__'],
    ['an id with a path in it', '../../etc/passwd'],
    ['an id with spaces', 'two words'],
    ['an id with markup', '<img src=x>'],
    ['an empty id', ''],
    ['an id over 100 characters', 'a'.repeat(101)],
  ])('leaves out a poem with %s', (_name, id) => {
    const read = readBackup(fileOf([poem(id)]));
    expect(read).toMatchObject({ ok: true, poems: [], unreadable: 1 });
  });

  it('does not let a "__proto__" id change what other poems are', () => {
    const text = `{"format":"${BACKUP_FORMAT}","version":1,"poems":[{"id":"__proto__","schemaVersion":1,"passageId":"p","retainedTokenIds":[],"lineBreaks":[],"erasureStyle":"blackout","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]}`;
    expect(readBackup(text)).toMatchObject({ ok: true, poems: [], unreadable: 1 });
    expect(({} as Record<string, unknown>).passageId).toBeUndefined();
  });
});

describe('whether two poems are the same', () => {
  it('is true for the same poem, and counts a missing title or notes as an empty one', () => {
    expect(samePoem(poem('a'), poem('a'))).toBe(true);
    const bare = { ...poem('a') } as Partial<Poem>;
    delete bare.notes;
    expect(samePoem(poem('a', { notes: '' }), bare as Poem)).toBe(true);
  });

  it.each([
    ['title', { title: 'Other' }],
    ['notes', { notes: 'x' }],
    ['style', { erasureStyle: 'faded' as const }],
    ['words', { retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [] }],
    ['breaks', { lineBreaks: [] }],
    ['passage', { passageId: 'jane-eyre-ch1' }],
    ['updated', { updatedAt: '2026-02-02T00:00:00.000Z' }],
  ])('is false when the %s differs', (_name, change) => {
    expect(samePoem(poem('a'), poem('a', change))).toBe(false);
  });
});

describe('what restoring would do', () => {
  it('adds the poems the collection does not have, and nothing else', () => {
    expect(planRestore([poem('a')], [poem('a'), poem('b'), poem('c')])).toEqual({
      toAdd: [poem('b'), poem('c')],
      alreadyHere: 1,
      differentKept: 0,
    });
  });

  it('keeps the collection\'s version of a poem that has changed since the backup', () => {
    const plan = planRestore([poem('a', { title: 'Now' })], [poem('a', { title: 'Then' })]);
    expect(plan).toEqual({ toAdd: [], alreadyHere: 0, differentKept: 1 });
  });

  it('has nothing to add when everything is already there', () => {
    expect(planRestore([poem('a'), poem('b')], [poem('b'), poem('a')])).toEqual({ toAdd: [], alreadyHere: 2, differentKept: 0 });
    expect(planRestore([poem('a')], [])).toEqual({ toAdd: [], alreadyHere: 0, differentKept: 0 });
  });

  it('adds everything to an empty collection', () => {
    expect(planRestore([], [poem('a'), poem('b')]).toAdd).toHaveLength(2);
  });
});

describe('backing up and restoring a collection', () => {
  const setup = () => {
    const storage = new MemoryStorageAdapter();
    const service = new PoemService(new BrowserPoemRepository(storage));
    const save = (title: string, extra = {}) =>
      service.savePoem({
        passageId: 'walden-woods',
        title,
        notes: `notes for ${title}`,
        retainedTokenIds: ['walden-woods-token-0001', 'walden-woods-token-0003'],
        lineBreaks: ['walden-woods-token-0001'],
        erasureStyle: 'faded',
        ...extra,
      });
    return { storage, service, save };
  };

  it('backs up every poem, newest first, under the dated file name', async () => {
    const { service, save } = setup();
    const first = await save('First');
    await new Promise(r => setTimeout(r, 5));
    const second = await save('Second');
    const now = new Date(2026, 9, 25, 9, 0);

    const backup = await service.exportBackup(now);
    expect(backup.filename).toBe('palimpsest-backup-2026-10-25.json');
    expect(backup.count).toBe(2);
    const read = readBackup(backup.text);
    expect(read.ok && read.poems.map(p => p.id)).toEqual([second.id, first.id]);
    expect(read.ok && read.poems).toEqual([second, first]);
  });

  it('backs up an empty collection as a file with no poems', async () => {
    const { service } = setup();
    const backup = await service.exportBackup();
    expect(backup.count).toBe(0);
    expect(readBackup(backup.text)).toMatchObject({ ok: true, poems: [] });
  });

  it('restores a backup into an empty collection exactly as it was', async () => {
    const { service, save } = setup();
    const a = await save('A');
    const b = await save('B');
    const { text } = await service.exportBackup();

    const fresh = setup().service;
    const read = readBackup(text);
    if (!read.ok) throw new Error('unreadable');
    const plan = await fresh.restoreBackup(read.poems);
    expect(plan.toAdd).toHaveLength(2);
    expect(await fresh.getPoem(a.id)).toEqual(a);
    expect(await fresh.getPoem(b.id)).toEqual(b);
  });

  it('adds only what is missing and never changes a poem that is there, changed or not', async () => {
    const { service, save } = setup();
    const kept = await save('Kept');
    const changed = await save('Will change');
    const { text } = await service.exportBackup();
    await service.renamePoem(changed.id, 'Changed since'); // the collection moves on
    await service.deletePoem(kept.id); // and loses one

    const read = readBackup(text);
    if (!read.ok) throw new Error('unreadable');
    const plan = await service.restoreBackup(read.poems);
    expect(plan).toMatchObject({ alreadyHere: 0, differentKept: 1 });
    expect(plan.toAdd.map(p => p.id)).toEqual([kept.id]);
    expect((await service.getPoem(changed.id))!.title).toBe('Changed since'); // the current version stays
    expect(await service.getPoem(kept.id)).toEqual(kept); // the deleted one is back
  });

  it('adds nothing the second time the same backup is restored', async () => {
    const { service, save } = setup();
    await save('A');
    const fresh = setup().service;
    const read = readBackup((await service.exportBackup()).text);
    if (!read.ok) throw new Error('unreadable');
    expect((await fresh.restoreBackup(read.poems)).toAdd).toHaveLength(1);
    expect(await fresh.restoreBackup(read.poems)).toEqual({ toAdd: [], alreadyHere: 1, differentKept: 0 });
    expect(await fresh.listPoems()).toHaveLength(1);
  });

  it('stores all of the poems or none: a full browser leaves the collection as it was', async () => {
    const { service, storage, save } = setup();
    await save('Existing');
    const before = storage.getItem('palimpsest:poems:v1');
    storage.setItem = () => {
      throw new Error('quota');
    };
    await expect(service.restoreBackup([poem('x'), poem('y')])).rejects.toBeInstanceOf(StorageError);
    storage.setItem = MemoryStorageAdapter.prototype.setItem.bind(storage);
    expect(storage.getItem('palimpsest:poems:v1')).toBe(before);
    expect(await service.listPoems()).toHaveLength(1);
  });

  it('writes the whole restore in one go, not poem by poem', async () => {
    const { service, storage } = setup();
    let writes = 0;
    const original = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      writes++;
      original(key, value);
    };
    await service.restoreBackup(Array.from({ length: 50 }, (_, i) => poem(`p${i}`)));
    expect(writes).toBe(1);
  });

  it('refuses to store a poem called "__proto__", whatever route it took', async () => {
    const { service } = setup();
    await expect(service.restoreBackup([poem('__proto__')])).rejects.toThrow('cannot be stored');
    expect(await service.listPoems()).toEqual([]);
  });
});
