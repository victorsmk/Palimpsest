import { describe, it, expect } from 'vitest';
import { MAX_TITLE_LENGTH, PoemService, cleanTitle, copyTitle } from '@/lib/services';
import { BrowserPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';

function setup() {
  const service = new PoemService(new BrowserPoemRepository(new MemoryStorageAdapter()));
  const save = (title: string, overrides = {}) =>
    service.savePoem({
      passageId: 'walden-woods',
      title,
      notes: 'why these words',
      retainedTokenIds: ['walden-woods-token-0001', 'walden-woods-token-0003'],
      lineBreaks: ['walden-woods-token-0001'],
      erasureStyle: 'faded',
      ...overrides,
    });
  return { service, save };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

describe('cleanTitle', () => {
  it('trims, and falls back to "Untitled Poem" when nothing is left', () => {
    expect(cleanTitle('  Quiet Woods  ')).toBe('Quiet Woods');
    expect(cleanTitle('')).toBe('Untitled Poem');
    expect(cleanTitle('   \n ')).toBe('Untitled Poem');
  });

  it('cuts a title that is too long, and does not leave a space at the cut', () => {
    expect(cleanTitle('a'.repeat(200))).toBe('a'.repeat(MAX_TITLE_LENGTH));
    expect(cleanTitle(`${'a'.repeat(MAX_TITLE_LENGTH - 1)} b`)).toBe('a'.repeat(MAX_TITLE_LENGTH - 1));
  });
});

describe('copyTitle', () => {
  it('puts "(copy)" in parentheses after the title', () => {
    expect(copyTitle('Quiet Woods')).toBe('Quiet Woods (copy)');
    expect(copyTitle('Quiet Woods (copy)')).toBe('Quiet Woods (copy) (copy)');
  });

  it('names a poem with no title as an untitled copy', () => {
    expect(copyTitle(undefined)).toBe('Untitled Poem (copy)');
    expect(copyTitle('  ')).toBe('Untitled Poem (copy)');
  });

  it('cuts the original short rather than go over the limit, always keeping "(copy)"', () => {
    const title = copyTitle('a'.repeat(300));
    expect(title).toHaveLength(MAX_TITLE_LENGTH);
    expect(title.endsWith(' (copy)')).toBe(true);
  });
});

describe('renaming a poem', () => {
  it('changes the title and nothing else', async () => {
    const { service, save } = setup();
    const poem = await save('Old name');
    await tick();
    const renamed = await service.renamePoem(poem.id, '  New name ');

    expect(renamed.title).toBe('New name');
    expect(renamed).toMatchObject({
      id: poem.id,
      passageId: poem.passageId,
      notes: poem.notes,
      retainedTokenIds: poem.retainedTokenIds,
      lineBreaks: poem.lineBreaks,
      erasureStyle: 'faded',
      createdAt: poem.createdAt,
    });
    expect(await service.getPoem(poem.id)).toEqual(renamed);
  });

  it('counts as a change, so the poem moves to the top of the list', async () => {
    const { service, save } = setup();
    const first = await save('First');
    await tick();
    const second = await save('Second');
    expect((await service.listPoems()).map(p => p.id)).toEqual([second.id, first.id]);

    await tick();
    const renamed = await service.renamePoem(first.id, 'First, renamed');
    expect(new Date(renamed.updatedAt).getTime()).toBeGreaterThan(new Date(first.updatedAt).getTime());
    expect((await service.listPoems()).map(p => p.id)).toEqual([first.id, second.id]);
  });

  it('turns an empty title into "Untitled Poem" and cuts a long one', async () => {
    const { service, save } = setup();
    const poem = await save('Named');
    expect((await service.renamePoem(poem.id, '   ')).title).toBe('Untitled Poem');
    expect((await service.renamePoem(poem.id, 'x'.repeat(500))).title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('refuses a poem that is not there, and creates nothing', async () => {
    const { service } = setup();
    await expect(service.renamePoem('missing', 'Anything')).rejects.toThrow('no longer in your collection');
    expect(await service.listPoems()).toEqual([]);
  });
});

describe('duplicating a poem', () => {
  it('saves a separate copy with the same words, breaks, style and notes', async () => {
    const { service, save } = setup();
    const poem = await save('Quiet Woods');
    await tick();
    const copy = await service.duplicatePoem(poem.id);

    expect(copy.id).not.toBe(poem.id);
    expect(copy.title).toBe('Quiet Woods (copy)');
    expect(copy).toMatchObject({
      passageId: poem.passageId,
      notes: poem.notes,
      retainedTokenIds: poem.retainedTokenIds,
      lineBreaks: poem.lineBreaks,
      erasureStyle: 'faded',
    });
    expect(new Date(copy.createdAt).getTime()).toBeGreaterThan(new Date(poem.createdAt).getTime());
  });

  it('leaves the original exactly as it was', async () => {
    const { service, save } = setup();
    const poem = await save('Quiet Woods');
    await tick();
    await service.duplicatePoem(poem.id);
    expect(await service.getPoem(poem.id)).toEqual(poem);
  });

  it('makes a copy that is independent: changing one does not change the other', async () => {
    const { service, save } = setup();
    const poem = await save('Quiet Woods');
    const copy = await service.duplicatePoem(poem.id);
    await service.renamePoem(copy.id, 'Different');
    expect((await service.getPoem(poem.id))!.title).toBe('Quiet Woods');
    await service.deletePoem(copy.id);
    expect(await service.getPoem(poem.id)).toEqual(poem);
    // the arrays are not shared either
    expect(copy.retainedTokenIds).not.toBe(poem.retainedTokenIds);
  });

  it('puts the copy at the top of the list', async () => {
    const { service, save } = setup();
    const poem = await save('Quiet Woods');
    await tick();
    const copy = await service.duplicatePoem(poem.id);
    expect((await service.listPoems()).map(p => p.id)).toEqual([copy.id, poem.id]);
  });

  it('refuses a poem that is not there, and creates nothing', async () => {
    const { service } = setup();
    await expect(service.duplicatePoem('missing')).rejects.toThrow('no longer in your collection');
    expect(await service.listPoems()).toEqual([]);
  });
});
