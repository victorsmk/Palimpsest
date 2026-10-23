import { describe, it, expect } from 'vitest';
import { PoemService } from '@/lib/services';
import { BrowserPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';

describe('PoemService (Persistence & Draft Management)', () => {
  it('saves and retrieves a new poem draft with stable metadata', async () => {
    const memory = new MemoryStorageAdapter();
    const repo = new BrowserPoemRepository(memory);
    const service = new PoemService(repo);

    const saved = await service.savePoem({
      passageId: 'jane-eyre-ch1',
      title: 'Winter Shadows',
      retainedTokenIds: ['tok-1', 'tok-2', 'tok-5'],
      lineBreaks: ['tok-2'],
      erasureStyle: 'blackout',
      notes: 'Initial discovery test',
    });

    expect(saved.id).toBeDefined();
    expect(saved.schemaVersion).toBe(1);
    expect(saved.title).toBe('Winter Shadows');
    expect(saved.retainedTokenIds).toEqual(['tok-1', 'tok-2', 'tok-5']);
    expect(saved.lineBreaks).toEqual(['tok-2']);
    expect(saved.erasureStyle).toBe('blackout');

    const fetched = await service.getPoem(saved.id);
    expect(fetched).toEqual(saved);
  });

  it('updates an existing poem preserving createdAt while updating updatedAt', async () => {
    const memory = new MemoryStorageAdapter();
    const repo = new BrowserPoemRepository(memory);
    const service = new PoemService(repo);

    const initial = await service.savePoem({
      passageId: 'walden-woods',
      title: 'First Draft',
      retainedTokenIds: ['tok-1'],
      lineBreaks: [],
      erasureStyle: 'faded',
    });

    // Wait slightly to ensure updatedAt differs
    await new Promise(r => setTimeout(r, 5));

    const updated = await service.savePoem({
      id: initial.id,
      passageId: 'walden-woods',
      title: 'Revised Draft',
      retainedTokenIds: ['tok-1', 'tok-3'],
      lineBreaks: ['tok-3'],
      erasureStyle: 'whiteout',
    });

    expect(updated.id).toBe(initial.id);
    expect(updated.title).toBe('Revised Draft');
    expect(updated.createdAt).toBe(initial.createdAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(initial.updatedAt).getTime()
    );
  });

  it('lists poems ordered by most recent updatedAt descending', async () => {
    const memory = new MemoryStorageAdapter();
    const repo = new BrowserPoemRepository(memory);
    const service = new PoemService(repo);

    const p1 = await service.savePoem({
      passageId: 'dorian-gray-ch1',
      title: 'Poem One',
      retainedTokenIds: ['tok-1'],
      lineBreaks: [],
      erasureStyle: 'blackout',
    });

    await new Promise(r => setTimeout(r, 5));

    const p2 = await service.savePoem({
      passageId: 'dorian-gray-ch1',
      title: 'Poem Two',
      retainedTokenIds: ['tok-2'],
      lineBreaks: [],
      erasureStyle: 'blackout',
    });

    const list = await service.listPoems();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(p2.id); // Most recent first
    expect(list[1].id).toBe(p1.id);

    // Delete one
    await service.deletePoem(p1.id);
    const remaining = await service.listPoems();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(p2.id);
  });
});
