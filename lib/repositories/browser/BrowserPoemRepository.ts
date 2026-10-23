import type { PoemRepository } from '@/lib/repositories';
import type { Poem } from '@/lib/models';

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

  private loadAll(): Record<string, Poem> {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      return parsed as Record<string, Poem>;
    } catch {
      return {};
    }
  }

  private saveAll(data: Record<string, Poem>): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Gracefully handle storage errors (e.g. quota exceeded)
    }
  }

  async save(poem: Poem): Promise<void> {
    const data = this.loadAll();
    data[poem.id] = poem;
    this.saveAll(data);
  }

  async get(id: string): Promise<Poem | null> {
    const data = this.loadAll();
    return data[id] ?? null;
  }

  async list(): Promise<Poem[]> {
    const data = this.loadAll();
    return Object.values(data);
  }

  async delete(id: string): Promise<void> {
    const data = this.loadAll();
    delete data[id];
    this.saveAll(data);
  }
}
