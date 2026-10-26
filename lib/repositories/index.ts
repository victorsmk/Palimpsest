import type { Book, Passage, Poem, Collection } from '@/lib/models';

export interface BookRepository {
  listBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | null>;
  getPassage(id: string): Promise<Passage | null>;
  listPassages(bookId: string): Promise<Passage[]>;
}

export interface PoemRepository {
  save(poem: Poem): Promise<void>;
  /** Saves several poems in one write: all of them are stored, or none are. */
  saveMany(poems: Poem[]): Promise<void>;
  get(id: string): Promise<Poem | null>;
  list(): Promise<Poem[]>;
  delete(id: string): Promise<void>;
}

export interface CollectionRepository {
  save(collection: Collection): Promise<void>;
  get(id: string): Promise<Collection | null>;
  list(): Promise<Collection[]>;
  delete(id: string): Promise<void>;
}

export { BrowserBookRepository } from './browser/BrowserBookRepository';
export { BrowserPoemRepository, MemoryStorageAdapter } from './browser/BrowserPoemRepository';

export { MemoryPoemRepository } from './memory/MemoryPoemRepository';
