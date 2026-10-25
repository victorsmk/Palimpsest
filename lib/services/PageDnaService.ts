import type { Passage } from '@/lib/models';
import { calculatePageDNA, foundSearch } from '@/lib/search/found';
import { getSyllableMap, lookupWord, type SyllableResult } from '@/lib/syllables';

/**
 * Page DNA: distinct contiguous 5-7-5 candidates per 100 words under the Found
 * search rules. It measures candidate density, not poetic quality. The syllable
 * dictionary is loaded on first use and the result is cached per passage.
 */
export class PageDnaService {
  private cache = new Map<string, Promise<number>>();

  getPageDNA(passage: Pick<Passage, 'id' | 'tokens'>): Promise<number> {
    let result = this.cache.get(passage.id);
    if (!result) {
      result = this.compute(passage);
      // A failed load must not be cached forever.
      result.catch(() => this.cache.delete(passage.id));
      this.cache.set(passage.id, result);
    }
    return result;
  }

  private async compute(passage: Pick<Passage, 'id' | 'tokens'>): Promise<number> {
    const dictionary = await getSyllableMap();
    const words = passage.tokens.filter(t => t.isSelectable && t.kind === 'word');
    const syllables = new Map<string, SyllableResult>(
      words.map(token => [token.id, lookupWord(token.word, dictionary)])
    );
    const candidates = foundSearch(passage.tokens, syllables, passage.id);
    return calculatePageDNA(candidates.length, words.length);
  }
}

export const pageDnaService = new PageDnaService();
