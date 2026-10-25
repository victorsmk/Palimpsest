import type { Passage } from '@/lib/models';
import { analyzeFound, foundSearch, type PageDna } from '@/lib/search/found';
import { getSyllableMap, lookupWord, type SyllableResult } from '@/lib/syllables';

/**
 * Page DNA for a passage: how many poems there are to find and where (see `PageDna`). The syllable
 * dictionary is loaded on first use and the result is cached per passage.
 */
export class PageDnaService {
  private cache = new Map<string, Promise<PageDna>>();

  getPageDna(passage: Pick<Passage, 'id' | 'tokens'>): Promise<PageDna> {
    let result = this.cache.get(passage.id);
    if (!result) {
      result = this.compute(passage);
      // A failed load must not be cached forever.
      result.catch(() => this.cache.delete(passage.id));
      this.cache.set(passage.id, result);
    }
    return result;
  }

  private async compute(passage: Pick<Passage, 'id' | 'tokens'>): Promise<PageDna> {
    const dictionary = await getSyllableMap();
    const words = passage.tokens.filter(t => t.isSelectable && t.kind === 'word');
    const syllables = new Map<string, SyllableResult>(
      words.map(token => [token.id, lookupWord(token.word, dictionary)])
    );
    const candidates = foundSearch(passage.tokens, syllables, passage.id);
    return analyzeFound(passage.tokens, candidates).pageDna;
  }
}

export const pageDnaService = new PageDnaService();
