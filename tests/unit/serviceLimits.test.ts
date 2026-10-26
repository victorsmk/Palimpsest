import { describe, it, expect } from 'vitest';
import { LIMITS, PoemLimitError, poemLimitProblem, type Poem } from '@/lib/models';
import { MAX_BACKUP_BYTES, MAX_BACKUP_POEMS } from '@/lib/backup';
import { MemoryPoemRepository } from '@/lib/repositories';
import { MAX_TITLE_LENGTH, PoemService } from '@/lib/services';

const base = {
  passageId: 'walden-woods',
  retainedTokenIds: ['walden-woods-token-0001', 'walden-woods-token-0003'],
  lineBreaks: ['walden-woods-token-0001'],
  erasureStyle: 'blackout' as const,
};

const stored = (id: string): Poem => ({
  ...base,
  id,
  schemaVersion: 2, revision: 1,
  title: id,
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
});

function setup(count = 0) {
  const repo = new MemoryPoemRepository();
  const service = new PoemService(repo);
  const fill = (n: number) => repo.importMany(Array.from({ length: n }, (_, i) => stored(`p${i}`)));
  return { repo, service, fill, ready: count ? fill(count) : Promise.resolve() };
}

describe('the limits, in one place', () => {
  it('are the numbers the rest of the app uses', () => {
    expect(MAX_TITLE_LENGTH).toBe(LIMITS.titleMax);
    expect(MAX_BACKUP_BYTES).toBe(LIMITS.backupBytesMax);
    expect(MAX_BACKUP_POEMS).toBe(LIMITS.poemsMax);
    expect(LIMITS).toMatchObject({ titleMax: 120, notesMax: 10_000, poemsMax: 2_000 });
  });

  it('say which limit a poem is over, and nothing when it is within them', () => {
    expect(poemLimitProblem({ notes: 'a'.repeat(LIMITS.notesMax), retainedTokenIds: [] })).toBeNull();
    expect(poemLimitProblem({ notes: 'a'.repeat(LIMITS.notesMax + 1), retainedTokenIds: [] })).toBe('Notes can be at most 10,000 characters.');
    expect(poemLimitProblem({ notes: undefined, retainedTokenIds: Array.from({ length: LIMITS.retainedMax + 1 }, (_, i) => `t${i}`) })).toBe(
      'A poem can keep at most 10,000 words.'
    );
  });
});

describe('saving a poem within the limits', () => {
  it('cuts a title that is too long, however it is saved, and does not leave a space at the cut', async () => {
    const { service } = setup();
    expect((await service.savePoem({ ...base, title: 'x'.repeat(500) })).title).toHaveLength(LIMITS.titleMax);
    expect((await service.savePoem({ ...base, title: `${'y'.repeat(LIMITS.titleMax - 1)} z` })).title).toBe('y'.repeat(LIMITS.titleMax - 1));
  });

  it('gives an empty title the name "Untitled Poem"', async () => {
    const { service } = setup();
    expect((await service.savePoem({ ...base, title: '   ' })).title).toBe('Untitled Poem');
    expect((await service.savePoem({ ...base })).title).toBe('Untitled Poem');
  });

  it('accepts notes of exactly the limit', async () => {
    const { service } = setup();
    expect((await service.savePoem({ ...base, notes: 'n'.repeat(LIMITS.notesMax) })).notes).toHaveLength(LIMITS.notesMax);
  });
});

describe('saving a poem over a limit', () => {
  it('refuses notes that are too long, says so in plain words, and stores nothing', async () => {
    const { service, repo } = setup();
    const attempt = service.savePoem({ ...base, title: 'Long notes', notes: 'n'.repeat(LIMITS.notesMax + 1) });
    await expect(attempt).rejects.toBeInstanceOf(PoemLimitError);
    await expect(attempt).rejects.toThrow('Notes can be at most 10,000 characters.');
    expect((await repo.list()).items).toEqual([]);
  });

  it('does not cut the notes of a poem that is already saved either: it refuses, and the poem stays as it was', async () => {
    const { service } = setup();
    const saved = await service.savePoem({ ...base, title: 'Kept', notes: 'short' });
    await expect(service.savePoem({ ...base, id: saved.id, title: 'Kept', notes: 'n'.repeat(LIMITS.notesMax + 1) })).rejects.toBeInstanceOf(PoemLimitError);
    expect((await service.getPoem(saved.id))!.notes).toBe('short');
  });

  it('refuses a poem that keeps too many words', async () => {
    const { service } = setup();
    const words = Array.from({ length: LIMITS.retainedMax + 1 }, (_, i) => `walden-woods-token-${i}`);
    await expect(service.savePoem({ ...base, retainedTokenIds: words, lineBreaks: [] })).rejects.toBeInstanceOf(PoemLimitError);
  });

  it('tells a limit apart from any other failure, by its code', async () => {
    const { service } = setup();
    const error = await service.savePoem({ ...base, notes: 'n'.repeat(LIMITS.notesMax + 1) }).catch(e => e);
    expect(error).toMatchObject({ name: 'PoemLimitError', code: 'limit' });
  });
});

describe('a full collection', () => {
  it('refuses a new poem, and says why', async () => {
    const { service, fill } = setup();
    await fill(LIMITS.poemsMax);
    const attempt = service.savePoem({ ...base, title: 'One too many' });
    await expect(attempt).rejects.toBeInstanceOf(PoemLimitError);
    await expect(attempt).rejects.toThrow('Your collection is full: it can hold up to 2,000 poems. Delete some to save more.');
    expect(await service.listPoems()).toHaveLength(LIMITS.poemsMax);
  });

  it('still lets a poem that is already in it be saved, renamed and deleted', async () => {
    const { service, fill } = setup();
    await fill(LIMITS.poemsMax);
    await expect(service.savePoem({ ...base, id: 'p0', expectedRevision: 1, title: 'Edited' })).resolves.toMatchObject({ title: 'Edited' });
    await expect(service.renamePoem('p1', 'Renamed')).resolves.toMatchObject({ title: 'Renamed' });
    await service.deletePoem('p2');
    await expect(service.savePoem({ ...base, title: 'Room now' })).resolves.toBeDefined();
  });

  it('takes the poem that fills it exactly, and refuses a copy of one at the limit', async () => {
    const { service, fill } = setup();
    await fill(LIMITS.poemsMax - 1);
    await expect(service.savePoem({ ...base, title: 'The last one' })).resolves.toBeDefined();
    await expect(service.duplicatePoem('p0')).rejects.toBeInstanceOf(PoemLimitError);
  });

  it('refuses a restore that would take it over, adding none of it', async () => {
    const { service, fill } = setup();
    await fill(LIMITS.poemsMax - 2);
    const incoming = [stored('new1'), stored('new2'), stored('new3')];
    await expect(service.restoreBackup(incoming)).rejects.toBeInstanceOf(PoemLimitError);
    expect(await service.listPoems()).toHaveLength(LIMITS.poemsMax - 2);
  });

  it('takes a restore that fills it exactly', async () => {
    const { service, fill } = setup();
    await fill(LIMITS.poemsMax - 2);
    await service.restoreBackup([stored('new1'), stored('new2')]);
    expect(await service.listPoems()).toHaveLength(LIMITS.poemsMax);
  });
});
