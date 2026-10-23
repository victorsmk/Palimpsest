import type { PoemRepository } from '@/lib/repositories';
import { BrowserPoemRepository } from '@/lib/repositories';
import type { ErasureStyle, Poem } from '@/lib/models';

export interface SavePoemInput {
  id?: string;
  passageId: string;
  title?: string;
  notes?: string;
  retainedTokenIds: string[];
  lineBreaks: string[];
  erasureStyle: ErasureStyle;
}

export class PoemService {
  private repo: PoemRepository;

  constructor(repo?: PoemRepository) {
    this.repo = repo ?? new BrowserPoemRepository();
  }

  /**
   * Saves a new poem or updates an existing one.
   */
  async savePoem(input: SavePoemInput): Promise<Poem> {
    const now = new Date().toISOString();
    const existing = input.id ? await this.repo.get(input.id) : null;

    const poem: Poem = {
      id: input.id || `poem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      schemaVersion: 1,
      passageId: input.passageId,
      title: input.title?.trim() || 'Untitled Poem',
      notes: input.notes?.trim() || '',
      retainedTokenIds: [...input.retainedTokenIds],
      lineBreaks: [...input.lineBreaks],
      erasureStyle: input.erasureStyle,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await this.repo.save(poem);
    return poem;
  }

  async getPoem(id: string): Promise<Poem | null> {
    return this.repo.get(id);
  }

  async listPoems(): Promise<Poem[]> {
    const list = await this.repo.list();
    // Sort by most recently updated first
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async deletePoem(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Default singleton instance for UI usage
export const poemService = new PoemService();
