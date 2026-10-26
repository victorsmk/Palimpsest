import type { PoemRepository } from '@/lib/repositories';
import { LIMITS, POEM_SCHEMA_VERSION, PoemLimitError, newId, poemLimitProblem, type ErasureStyle, type Poem } from '@/lib/models';
import { backupFilename, createBackup, planRestore, serializeBackup, type RestorePlan } from '@/lib/backup';

export interface SavePoemInput {
  id?: string;
  passageId: string;
  title?: string;
  notes?: string;
  retainedTokenIds: string[];
  lineBreaks: string[];
  erasureStyle: ErasureStyle;
  /** The version of the passage text the poem was made from (see passageVersionOf). Kept as it was if left out. */
  passageVersion?: string;
}

/** The longest title a poem can be given. A longer one is cut to this. */
export const MAX_TITLE_LENGTH = LIMITS.titleMax;

const COLLECTION_FULL = `Your collection is full: it can hold up to ${LIMITS.poemsMax.toLocaleString('en-US')} poems. Delete some to save more.`;

const UNTITLED = 'Untitled Poem';
const COPY_SUFFIX = ' (copy)';

/** A title as it is stored: trimmed, never empty, never longer than the limit. */
export function cleanTitle(title: string): string {
  return title.trim().slice(0, MAX_TITLE_LENGTH).trimEnd() || UNTITLED;
}

/** The title of a copy: "Quiet Woods (copy)", with the original cut short if the result would be too long. */
export function copyTitle(title: string | undefined): string {
  const base = (title?.trim() || UNTITLED).slice(0, MAX_TITLE_LENGTH - COPY_SUFFIX.length).trimEnd();
  return `${base}${COPY_SUFFIX}`;
}

export class PoemService {
  private repo: PoemRepository;

  /** The repository is given, not chosen here: see `lib/services/container.ts` for where it is. */
  constructor(repo: PoemRepository) {
    this.repo = repo;
  }

  /**
   * Saves a new poem or updates an existing one. A title that is too long is cut to the limit; notes
   * or a poem over their limits, and a new poem in a full collection, are refused with a
   * PoemLimitError whose message can be shown to the writer.
   */
  async savePoem(input: SavePoemInput): Promise<Poem> {
    const now = new Date().toISOString();
    const existing = input.id ? await this.repo.get(input.id) : null;

    const notes = input.notes?.trim() || '';
    const problem = poemLimitProblem({ notes, retainedTokenIds: input.retainedTokenIds });
    if (problem) throw new PoemLimitError(problem);
    if (!existing && (await this.repo.list()).length >= LIMITS.poemsMax) throw new PoemLimitError(COLLECTION_FULL);

    const poem: Poem = {
      id: input.id || newId(),
      schemaVersion: POEM_SCHEMA_VERSION,
      revision: existing ? existing.revision + 1 : 1,
      passageId: input.passageId,
      title: cleanTitle(input.title ?? ''),
      notes,
      retainedTokenIds: [...input.retainedTokenIds],
      lineBreaks: [...input.lineBreaks],
      erasureStyle: input.erasureStyle,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    const passageVersion = input.passageVersion ?? existing?.passageVersion;
    if (passageVersion) poem.passageVersion = passageVersion;

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

  /**
   * Gives a poem a new title and nothing else: its words, breaks, style and notes are kept. It counts
   * as a change, so the poem moves to the top of the list.
   */
  async renamePoem(id: string, title: string): Promise<Poem> {
    const poem = await this.repo.get(id);
    if (!poem) throw new Error('That poem is no longer in your collection.');
    return this.savePoem({ ...poem, title: cleanTitle(title) });
  }

  /** Saves a separate copy of a poem, titled "... (copy)". The original is not touched. */
  async duplicatePoem(id: string): Promise<Poem> {
    const poem = await this.repo.get(id);
    if (!poem) throw new Error('That poem is no longer in your collection.');
    return this.savePoem({
      passageId: poem.passageId,
      title: copyTitle(poem.title),
      notes: poem.notes,
      retainedTokenIds: poem.retainedTokenIds,
      lineBreaks: poem.lineBreaks,
      erasureStyle: poem.erasureStyle,
      passageVersion: poem.passageVersion,
    });
  }

  /** Every poem in the collection as the text of a backup file, with the name to give the file. */
  async exportBackup(now: Date = new Date()): Promise<{ filename: string; text: string; count: number }> {
    const poems = await this.listPoems();
    return { filename: backupFilename(now), text: serializeBackup(createBackup(poems, now)), count: poems.length };
  }

  /** What restoring these poems would do to the collection as it is now. Changes nothing. */
  async planRestore(incoming: Poem[]): Promise<RestorePlan> {
    return planRestore(await this.repo.list(), incoming);
  }

  /**
   * Adds the poems of a backup that the collection does not already have, in one write. A poem the
   * collection has, changed or not, is never touched. What is added is worked out again here, from
   * the collection as it is at this moment, so a collection that changed since the question was
   * asked is not overwritten.
   */
  async restoreBackup(incoming: Poem[]): Promise<RestorePlan> {
    const existing = await this.repo.list();
    const plan = planRestore(existing, incoming);
    if (existing.length + plan.toAdd.length > LIMITS.poemsMax) throw new PoemLimitError(COLLECTION_FULL);
    if (plan.toAdd.length > 0) await this.repo.saveMany(plan.toAdd);
    return plan;
  }

  async deletePoem(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
