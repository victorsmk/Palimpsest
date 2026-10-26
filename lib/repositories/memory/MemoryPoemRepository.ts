import type { PoemRepository } from '@/lib/repositories';
import { PoemConflictError, PoemGoneError, type Poem, type PoemDraft } from '@/lib/models';
import { stampNew, stampUpdate } from '@/lib/models/stamp';

/**
 * A collection of poems held in memory, with no storage behind it. It is the simplest thing that
 * keeps the PoemRepository contract, which makes it the reference the contract tests are written
 * against (so that the contract is not an accident of how the browser happens to store things), and
 * a stand-in for tests and tools that need a repository without a browser. Poems go in and come out
 * as copies, so nothing a caller does to one changes what is stored.
 */
export class MemoryPoemRepository implements PoemRepository {
  private poems = new Map<string, Poem>();

  async create(draft: PoemDraft): Promise<Poem> {
    const poem = stampNew(draft);
    this.poems.set(poem.id, poem);
    return structuredClone(poem);
  }

  async update(id: string, draft: PoemDraft, expectedRevision: number): Promise<Poem> {
    const current = this.poems.get(id);
    if (!current) throw new PoemGoneError();
    if (current.revision !== expectedRevision) throw new PoemConflictError(structuredClone(current));
    const poem = stampUpdate(current, draft);
    this.poems.set(id, poem);
    return structuredClone(poem);
  }

  async importMany(poems: Poem[]): Promise<void> {
    // The same refusals as the browser repository: this id is not an ordinary key there, and an
    // id that is already stored is never overwritten.
    if (poems.some(poem => poem.id === '__proto__')) throw new Error('That poem cannot be stored.');
    const seen = new Set<string>();
    for (const poem of poems) {
      if (this.poems.has(poem.id) || seen.has(poem.id)) throw new Error('A poem with that id is already stored.');
      seen.add(poem.id);
    }
    for (const poem of poems) this.poems.set(poem.id, structuredClone(poem));
  }

  async get(id: string): Promise<Poem | null> {
    const poem = this.poems.get(id);
    return poem ? structuredClone(poem) : null;
  }

  async list(): Promise<Poem[]> {
    return [...this.poems.values()].map(poem => structuredClone(poem));
  }

  async delete(id: string): Promise<void> {
    this.poems.delete(id);
  }
}
