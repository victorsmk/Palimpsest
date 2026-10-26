import { describe, it, expect } from 'vitest';
import { MemoryPoemRepository } from '@/lib/repositories';
import { PoemService } from '@/lib/services/PoemService';
import { PoemConflictError, PoemGoneError } from '@/lib/models';

// Two tabs, or two devices, are two services over one store. These tests stand in for them.

const input = { passageId: 'walden-woods', title: 'Mine', retainedTokenIds: ['walden-woods-token-0001'], lineBreaks: [], erasureStyle: 'blackout' as const };

function twoTabs() {
  const repo = new MemoryPoemRepository();
  return { repo, tabA: new PoemService(repo), tabB: new PoemService(repo) };
}

describe('saving over a poem that was changed somewhere else', () => {
  it('is refused with the message for the writer, and the other tab’s version stays', async () => {
    const { tabA, tabB } = twoTabs();
    const opened = await tabA.savePoem(input); // both tabs have opened revision 1
    await tabA.savePoem({ ...input, id: opened.id, expectedRevision: 1, title: 'From tab A' });

    const attempt = tabB.savePoem({ ...input, id: opened.id, expectedRevision: 1, title: 'From tab B' });
    await expect(attempt).rejects.toBeInstanceOf(PoemConflictError);
    await expect(attempt).rejects.toThrow('This poem was changed somewhere else, for example in another tab. Open it again from My Collection to see the latest version.');
    expect(await tabB.getPoem(opened.id)).toMatchObject({ title: 'From tab A', revision: 2 });
  });

  it('can be saved after all from the revision the writer is then told about', async () => {
    const { tabA, tabB } = twoTabs();
    const opened = await tabA.savePoem(input);
    await tabA.savePoem({ ...input, id: opened.id, expectedRevision: 1, title: 'From tab A' });
    const conflict = (await tabB.savePoem({ ...input, id: opened.id, expectedRevision: 1 }).catch(e => e)) as PoemConflictError;
    const saved = await tabB.savePoem({ ...input, id: opened.id, expectedRevision: conflict.current.revision, title: 'From tab B' });
    expect(saved).toMatchObject({ title: 'From tab B', revision: 3 });
  });

  it('is refused for a save over an existing poem that does not say which revision it started from', async () => {
    const { tabA } = twoTabs();
    const opened = await tabA.savePoem(input);
    await expect(tabA.savePoem({ ...input, id: opened.id })).rejects.toThrow(/revision/);
    expect((await tabA.getPoem(opened.id))!.revision).toBe(1);
  });
});

describe('saving over a poem that was deleted somewhere else', () => {
  it('says so and does not bring it back', async () => {
    const { tabA, tabB } = twoTabs();
    const opened = await tabA.savePoem(input);
    await tabA.deletePoem(opened.id);

    const attempt = tabB.savePoem({ ...input, id: opened.id, expectedRevision: 1 });
    await expect(attempt).rejects.toBeInstanceOf(PoemGoneError);
    await expect(attempt).rejects.toThrow('This poem was deleted somewhere else, so it was not saved. You can save it again as a new poem.');
    expect(await tabB.listPoems()).toEqual([]);
  });

  it('lets the same words be saved as a new poem, which gets a new id', async () => {
    const { tabA, tabB } = twoTabs();
    const opened = await tabA.savePoem(input);
    await tabA.deletePoem(opened.id);
    const again = await tabB.savePoem(input);
    expect(again.id).not.toBe(opened.id);
    expect(again.revision).toBe(1);
  });
});

describe('renaming from a list that is out of date', () => {
  it('is refused when the poem has changed since the list was loaded, and changes nothing', async () => {
    const { tabA, tabB } = twoTabs();
    const opened = await tabA.savePoem(input);
    await tabA.savePoem({ ...input, id: opened.id, expectedRevision: 1, title: 'From tab A' });

    await expect(tabB.renamePoem(opened.id, 'Renamed', 1)).rejects.toBeInstanceOf(PoemConflictError);
    expect(await tabB.getPoem(opened.id)).toMatchObject({ title: 'From tab A', revision: 2 });
  });

  it('works from the revision the list shows, or from the current one when none is given', async () => {
    const { tabA } = twoTabs();
    const opened = await tabA.savePoem(input);
    expect(await tabA.renamePoem(opened.id, 'Once', 1)).toMatchObject({ title: 'Once', revision: 2 });
    expect(await tabA.renamePoem(opened.id, 'Twice')).toMatchObject({ title: 'Twice', revision: 3 });
  });
});

describe('restoring a backup', () => {
  it('adds the poems with their own ids and revisions, and a poem changed since is not touched', async () => {
    const { repo, tabA } = twoTabs();
    const made = await tabA.savePoem(input);
    await tabA.savePoem({ ...input, id: made.id, expectedRevision: 1, title: 'Edited since' });
    const plan = await tabA.restoreBackup([{ ...made }, { ...made, id: 'b0b0b0b0-0000-4000-8000-000000000001', revision: 5 }]);
    expect(plan.toAdd).toHaveLength(1);
    expect((await repo.get(made.id))!.title).toBe('Edited since');
    expect(await repo.get('b0b0b0b0-0000-4000-8000-000000000001')).toMatchObject({ revision: 5 });
  });
});
