import type { PoemRepository } from '@/lib/repositories';
import type { Poem } from '@/lib/models';
import { parsePoem } from './poemValidation';

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
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private writeRaw(data: Record<string, unknown>): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (cause) {
      throw new Error('Could not write to browser storage (it may be full or disabled).', { cause });
    }
  }

  private readPoem(key: string, entry: unknown): Poem | null {
    const poem = parsePoem(entry);
    return poem && poem.id === key ? poem : null;
  }

  async save(poem: Poem): Promise<void> {
    const data = this.loadRaw();
    data[poem.id] = poem;
    this.writeRaw(data);
  }

  async get(id: string): Promise<Poem | null> {
    const data = this.loadRaw();
    return id in data ? this.readPoem(id, data[id]) : null;
  }

  async list(): Promise<Poem[]> {
    const data = this.loadRaw();
    const poems: Poem[] = [];
    for (const [key, entry] of Object.entries(data)) {
      const poem = this.readPoem(key, entry);
      if (poem) poems.push(poem);
    }
    return poems;
  }

  async delete(id: string): Promise<void> {
    const data = this.loadRaw();
    delete data[id];
    this.writeRaw(data);
  }
}
