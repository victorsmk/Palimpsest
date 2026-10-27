import { summaryOf, type Passage, type PassageSummary } from '@/lib/models';
import { isUserId } from '@/lib/userTexts/id';

export const PASSAGE_UNAVAILABLE_MESSAGE = 'That passage could not be opened. Please try again.';

/**
 * What a screen knows of the library: every passage's summary from the start (small, so all of them
 * are listed), and the passages themselves only once they have been asked for. A passage is fetched
 * once however many things ask for it at the same moment, and a failed fetch is not remembered, so the
 * next ask tries again.
 */
export class PassageLibrary {
  private loaded = new Map<string, Passage>();
  private inFlight = new Map<string, Promise<Passage | null>>();

  /**
   * `summaries` are the passages this screen lists. With `openEnded`, the library also holds passages that are not
   * listed (the books of the server's library are too many to list), so any id is fetched when it is asked for,
   * and an id nothing has is simply not found.
   */
  constructor(
    readonly summaries: readonly PassageSummary[],
    private fetchPassage: (id: string) => Promise<Passage | null>,
    private options: { openEnded?: boolean } = {}
  ) {}

  /** A library over passages already in hand (tests, tools); nothing is fetched from anywhere. */
  static of(passages: readonly Passage[]): PassageLibrary {
    return new PassageLibrary(passages.map(summaryOf), async id => passages.find(p => p.id === id) ?? null);
  }

  /** Whether the library has a passage with this id (it need not be loaded yet). */
  has(id: string): boolean {
    return this.summaries.some(summary => summary.id === id);
  }

  /** A passage that has been loaded, or undefined (not asked for yet, or not in the library). */
  get(id: string): Passage | undefined {
    return this.loaded.get(id);
  }

  /** Every passage loaded so far, in the library's order. */
  passages(): Passage[] {
    return this.summaries.flatMap(summary => {
      const passage = this.loaded.get(summary.id);
      return passage ? [passage] : [];
    });
  }

  /**
   * Loads these passages (those not loaded yet) and returns the ones the library has. An id the
   * library does not have is skipped (an open-ended library asks for it, and skips it if there is none). If a fetch fails, so does this, and nothing is remembered of it.
   */
  async ensure(ids: Iterable<string>): Promise<Passage[]> {
    // A text the reader added is not in the list of summaries (they are too many to list), but it is asked for by its id.
    const wanted = [...new Set(ids)].filter(id => this.options.openEnded || this.has(id) || isUserId(id));
    await Promise.all(wanted.map(id => this.load(id)));
    return wanted.flatMap(id => {
      const passage = this.loaded.get(id);
      return passage ? [passage] : [];
    });
  }

  private load(id: string): Promise<Passage | null> {
    const have = this.loaded.get(id);
    if (have) return Promise.resolve(have);
    const pending = this.inFlight.get(id);
    if (pending) return pending;
    const request = this.fetchPassage(id)
      .then(passage => {
        if (passage) this.loaded.set(id, passage);
        return passage;
      })
      .finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, request);
    return request;
  }
}
