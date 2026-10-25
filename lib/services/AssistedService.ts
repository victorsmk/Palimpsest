import type { Passage } from '@/lib/models';
import { assistedSearch, type AssistedSearchResult } from '@/lib/search/assisted';
import { getSyllableMap, lookupWord, type SyllableResult } from '@/lib/syllables';

/** The most poems kept for a passage. The page shows them a few at a time. */
export const ASSISTED_POEM_LIMIT = 50;

/**
 * Assisted-mode results for a passage: a ranked, varied selection of 5–7–5 poems made by keeping
 * words in order and skipping the rest. The syllable dictionary is loaded on first use and the
 * search is cached per passage. It runs on the page's own thread (it takes a fraction of a second);
 * moving it to a Web Worker is possible because the search does not touch the UI.
 */
export class AssistedService {
  private cache = new Map<string, Promise<AssistedSearchResult>>();

  search(passage: Pick<Passage, 'id' | 'tokens'>): Promise<AssistedSearchResult> {
    let result = this.cache.get(passage.id);
    if (!result) {
      result = this.compute(passage);
      // A failed load must not be cached forever.
      result.catch(() => this.cache.delete(passage.id));
      this.cache.set(passage.id, result);
    }
    return result;
  }

  private async compute(passage: Pick<Passage, 'id' | 'tokens'>): Promise<AssistedSearchResult> {
    const dictionary = await getSyllableMap();
    const words = passage.tokens.filter(t => t.isSelectable && t.kind === 'word');
    const syllables = new Map<string, SyllableResult>(
      words.map(token => [token.id, lookupWord(token.word, dictionary)])
    );
    // Let the page draw its "looking for poems" message before the search takes the thread.
    await new Promise(resolve => setTimeout(resolve, 0));
    return assistedSearch(passage.tokens, syllables, passage.id, { limit: ASSISTED_POEM_LIMIT });
  }
}

export const assistedService = new AssistedService();
