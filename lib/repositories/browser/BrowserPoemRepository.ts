import type { PoemRepository } from '@/lib/repositories';
import { PoemConflictError, PoemExistsError, PoemGoneError, StorageError, storageFailureOf, summarizePoem, type Page, type PageRequest, type Poem, type PoemDraft, type PoemSummary } from '@/lib/models';
import { parseStoredPoem } from '@/lib/models/poemValidation';
import { stampNew, stampUpdate } from '@/lib/models/stamp';
import { pageOfPoems } from '../paging';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const STORAGE_KEY = 'palimpsest:poems:v1';

/**
 * Poems made before schema version 2 are kept under their old ids. This hands them out as version 2
 * poems under the id every poem now has, the same way every time (see legacyPoemId), so that reading
 * needs no migration step and nothing is written. The first write after that stores the whole
 * collection in its new form, which is the whole migration. Anything that is not a readable version 1
 * poem is passed through untouched; so is a version 1 poem whose new id is already taken, which is
 * kept rather than overwritten.
 */
function upgradeLegacyEntries(stored: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const legacy: { key: string; entry: unknown; poem: Poem }[] = [];
  for (const [key, entry] of Object.entries(stored)) {
    const parsed = parseStoredPoem(entry);
    const isLegacy = (entry as { schemaVersion?: unknown } | null)?.schemaVersion === 1;
    if (isLegacy && parsed && parsed.storedId === key) legacy.push({ key, entry, poem: parsed.poem });
    else result[key] = entry;
  }
  for (const { key, entry, poem } of legacy) {
    // If the new id is already held by another entry, the old poem stays exactly as it was stored.
    if (Object.hasOwn(result, poem.id)) result[key] = entry;
    else result[poem.id] = poem;
  }
  return result;
}

export class BrowserPoemRepository implements PoemRepository {
  private storage: StorageAdapter;

  constructor(storage?: StorageAdapter) {
    if (storage) {
      this.storage = storage;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      this.storage = window.localStorage;
    } else {
      this.storage = new MemoryStorageAdapter();
    }
  }

  /**
   * Loads the stored entries without validating them. Entries this build cannot
   * read (malformed, or written by a newer schema) are kept as-is so that saving
   * or deleting another poem never destroys them.
   */
  private loadRaw(): Record<string, unknown> {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
      return upgradeLegacyEntries(parsed as Record<string, unknown>);
    } catch {
      return {};
    }
  }

  private writeRaw(data: Record<string, unknown>): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (cause) {
      throw new StorageError(storageFailureOf(cause), { cause });
    }
  }

  private readPoem(key: string, entry: unknown): Poem | null {
    const parsed = parseStoredPoem(entry);
    return parsed && parsed.poem.id === key ? parsed.poem : null;
  }

  // Each write below reads, checks and writes in one go with nothing asynchronous in between, so two
  // tabs cannot interleave inside one of them.
  async create(draft: PoemDraft): Promise<Poem> {
    const data = this.loadRaw();
    const poem = stampNew(draft);
    data[poem.id] = poem;
    this.writeRaw(data);
    return structuredClone(poem);
  }

  async update(id: string, draft: PoemDraft, expectedRevision: number): Promise<Poem> {
    const data = this.loadRaw();
    const current = Object.hasOwn(data, id) ? this.readPoem(id, data[id]) : null;
    if (!current) throw new PoemGoneError();
    if (current.revision !== expectedRevision) throw new PoemConflictError(current);
    const poem = stampUpdate(current, draft);
    data[id] = poem;
    this.writeRaw(data);
    return structuredClone(poem);
  }

  async importMany(poems: Poem[]): Promise<void> {
    // An id is a key in the stored object, and "__proto__" is not an ordinary key.
    if (poems.some(poem => poem.id === '__proto__')) throw new Error('That poem cannot be stored.');
    const data = this.loadRaw();
    const seen = new Set<string>();
    for (const poem of poems) {
      if (Object.hasOwn(data, poem.id) || seen.has(poem.id)) throw new PoemExistsError();
      seen.add(poem.id);
    }
    for (const poem of poems) data[poem.id] = structuredClone(poem);
    this.writeRaw(data);
  }

  async get(id: string): Promise<Poem | null> {
    const data = this.loadRaw();
    return id in data ? this.readPoem(id, data[id]) : null;
  }

  /** Every readable poem. (Local storage is read whole whatever is asked of it; paging is for what is returned.) */
  private readAll(): Poem[] {
    const poems: Poem[] = [];
    for (const [key, entry] of Object.entries(this.loadRaw())) {
      const poem = this.readPoem(key, entry);
      if (poem) poems.push(poem);
    }
    return poems;
  }

  async getMany(ids: string[]): Promise<Poem[]> {
    const data = this.loadRaw();
    const found: Poem[] = [];
    for (const id of new Set(ids)) {
      const poem = Object.hasOwn(data, id) ? this.readPoem(id, data[id]) : null;
      if (poem) found.push(poem);
    }
    return found;
  }

  async count(): Promise<number> {
    return this.readAll().length;
  }

  async listSummaries(page?: PageRequest): Promise<Page<PoemSummary>> {
    const { items, next } = pageOfPoems(this.readAll(), page);
    return { items: items.map(summarizePoem), next };
  }

  async list(page?: PageRequest): Promise<Page<Poem>> {
    return pageOfPoems(this.readAll(), page);
  }

  async delete(id: string): Promise<void> {
    const data = this.loadRaw();
    delete data[id];
    this.writeRaw(data);
  }
}
