import type { PoemRepository } from '@/lib/repositories';
import type { Poem } from '@/lib/models';

/**
 * A collection of poems held in memory, with no storage behind it. It is the simplest thing that
 * keeps the PoemRepository contract, which makes it the reference the contract tests are written
 * against (so that the contract is not an accident of how the browser happens to store things), and
 * a stand-in for tests and tools that need a repository without a browser. Poems go in and come out
 * as copies, so nothing a caller does to one changes what is stored.
 */
export class MemoryPoemRepository implements PoemRepository {
  private poems = new Map<string, Poem>();

  async save(poem: Poem): Promise<void> {
    await this.saveMany([poem]);
  }

  async saveMany(poems: Poem[]): Promise<void> {
    // The same refusal as the browser repository: this id is not an ordinary key there.
    if (poems.some(poem => poem.id === '__proto__')) throw new Error('That poem cannot be stored.');
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
