import type { Book, Passage, Poem, PoemDraft, Collection } from '@/lib/models';

export interface BookRepository {
  listBooks(): Promise<Book[]>;
  getBook(id: string): Promise<Book | null>;
  getPassage(id: string): Promise<Passage | null>;
  listPassages(bookId: string): Promise<Passage[]>;
}

export interface PoemRepository {
  /** Stores a new poem. The store assigns its id, both times and revision 1, and returns the stored poem. */
  create(draft: PoemDraft): Promise<Poem>;
  /**
   * Replaces the content of a poem that started from `expectedRevision`, and returns the stored poem
   * (next revision, new `updatedAt`; id and `createdAt` kept). Refused, with nothing stored, by a
   * PoemConflictError if the stored revision is not `expectedRevision`, and by a PoemGoneError if the
   * poem is not stored (it is never re-created).
   */
  update(id: string, draft: PoemDraft, expectedRevision: number): Promise<Poem>;
  /**
   * Adds poems that already have their ids, times and revisions (restoring a backup), in one write:
   * all of them are stored, or none are. Refuses a poem whose id is already stored.
   */
  importMany(poems: Poem[]): Promise<void>;
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
