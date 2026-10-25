import type { Passage } from '@/lib/models';
import { analyzeFound, foundSearch, type FoundAnalysis } from '@/lib/search/found';
import { getSyllableMap, lookupWord, type SyllableResult } from '@/lib/syllables';

/**
 * Found-mode results for a passage: the poems to find (families, with their variants), the Page
 * DNA, and what was left out. The syllable dictionary is loaded on first use and the analysis is
 * cached per passage, so the Studio's Page DNA and the Discover page share one search.
 */
export class FoundService {
  private cache = new Map<string, Promise<FoundAnalysis>>();

  analyze(passage: Pick<Passage, 'id' | 'tokens'>): Promise<FoundAnalysis> {
    let result = this.cache.get(passage.id);
    if (!result) {
      result = this.compute(passage);
      // A failed load must not be cached forever.
      result.catch(() => this.cache.delete(passage.id));
      this.cache.set(passage.id, result);
    }
    return result;
  }

  private async compute(passage: Pick<Passage, 'id' | 'tokens'>): Promise<FoundAnalysis> {
    const dictionary = await getSyllableMap();
    const words = passage.tokens.filter(t => t.isSelectable && t.kind === 'word');
    const syllables = new Map<string, SyllableResult>(
      words.map(token => [token.id, lookupWord(token.word, dictionary)])
    );
    const candidates = foundSearch(passage.tokens, syllables, passage.id);
    return analyzeFound(passage.tokens, candidates);
  }
}

export const foundService = new FoundService();
