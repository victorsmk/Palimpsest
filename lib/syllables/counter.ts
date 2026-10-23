import type { SyllableResult } from './types';

let cachedMap: Record<string, number | 'ambiguous'> | null = null;

export async function getSyllableMap(): Promise<Record<string, number | 'ambiguous'>> {
  if (cachedMap) {
    return cachedMap;
  }
  const data = await import('@/data/cmudict/syllable-map.json');
  cachedMap = data.default as Record<string, number | 'ambiguous'>;
  return cachedMap;
}

/**
 * Normalizes input word into bare dictionary key format.
 */
function toDictKey(word: string): string {
  return word.toLowerCase().replace(/[’‘]/g, "'").trim();
}

/**
 * Counts syllables for a single word using the preprocessed CMU Pronouncing Dictionary.
 */
export async function countSyllables(word: string): Promise<SyllableResult> {
  const map = await getSyllableMap();
  return lookupWord(word, map);
}

/**
 * Synchronous batch lookup using the preloaded dictionary map.
 */
export function lookupWord(
  rawWord: string,
  map: Record<string, number | 'ambiguous'>
): SyllableResult {
  const key = toDictKey(rawWord);

  if (!key || /^[^a-z0-9]+$/.test(key)) {
    return { word: rawWord, count: null, confidence: 'unknown' };
  }

  // 1. Direct dictionary lookup
  const entry = map[key];
  if (typeof entry === 'number') {
    return { word: rawWord, count: entry, confidence: 'definite' };
  }
  if (entry === 'ambiguous') {
    return { word: rawWord, count: null, confidence: 'ambiguous' };
  }

  // 2. Hyphenated word fallback: sum individual components (e.g. "honey-sweet")
  if (key.includes('-')) {
    const parts = key.split('-').filter(Boolean);
    let totalCount = 0;
    let hasAmbiguous = false;
    let allKnown = true;

    for (const part of parts) {
      const partEntry = map[part];
      if (typeof partEntry === 'number') {
        totalCount += partEntry;
      } else if (partEntry === 'ambiguous') {
        hasAmbiguous = true;
      } else {
        allKnown = false;
        break;
      }
    }

    if (allKnown) {
      if (hasAmbiguous) {
        return { word: rawWord, count: null, confidence: 'ambiguous' };
      }
      return { word: rawWord, count: totalCount, confidence: 'definite' };
    }
  }

  // 3. Possessive fallback (e.g. if "bessie's" is not in dict, try "bessie")
  if (key.endsWith("'s")) {
    const base = key.slice(0, -2);
    const baseEntry = map[base];
    if (typeof baseEntry === 'number') {
      // In English, possessive 's adds a syllable after sibilants (s, z, x, ch, sh, ge)
      const addsSyllable = /(?:s|z|x|ch|sh|ge|ce)$/i.test(base);
      return {
        word: rawWord,
        count: baseEntry + (addsSyllable ? 1 : 0),
        confidence: 'definite',
      };
    }
    if (baseEntry === 'ambiguous') {
      return { word: rawWord, count: null, confidence: 'ambiguous' };
    }
  }

  // 4. Unknown word (e.g. archaic, foreign, or novel token)
  return { word: rawWord, count: null, confidence: 'unknown' };
}

/**
 * Counts syllables for a list of words, loading the dictionary only once.
 */
export async function countSyllablesBatch(words: string[]): Promise<SyllableResult[]> {
  const map = await getSyllableMap();
  return words.map(w => lookupWord(w, map));
}
