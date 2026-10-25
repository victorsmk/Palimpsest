import type { SyllableConfidence, SyllableMap, SyllableResult } from './types';

let cachedMap: SyllableMap | null = null;

export async function getSyllableMap(): Promise<SyllableMap> {
  if (cachedMap) {
    return cachedMap;
  }
  const data = await import('@/data/cmudict/syllable-map.json');
  cachedMap = data.default as SyllableMap;
  return cachedMap;
}

/**
 * Normalizes input word into bare dictionary key format.
 */
function toDictKey(word: string): string {
  return word.toLowerCase().replace(/[’‘]/g, "'").trim();
}

/** The counts the dictionary gives a word, ascending, or null when it is not in the dictionary. */
function entryCounts(map: SyllableMap, key: string): number[] | null {
  if (!Object.hasOwn(map, key)) return null;
  const entry = map[key];
  return typeof entry === 'number' ? [entry] : entry;
}

const unique = (counts: number[]) => [...new Set(counts)].sort((a, b) => a - b);
const plus = (counts: number[], n: number) => counts.map(c => c + n);

/** A result for a set of counts: one count is definite, several are ambiguous. */
function fromCounts(word: string, counts: number[]): SyllableResult {
  return counts.length === 1
    ? { word, count: counts[0], confidence: 'definite' }
    : { word, count: null, confidence: 'ambiguous', counts };
}

// ─── Estimating words that are not in the dictionary ────────────────────────────────────────────
// A word the dictionary does not list can often be worked out from one it does. Each rule below is
// narrow and documented, and its result is only ever "estimated": never presented as definite.
// Rules are tried in this order and the first that finds a dictionary word wins.
//   1. Spelling variants   sombre -> somber, endeavouring -> endeavoring, realise -> realize,
//                          quarrelling -> quarreling
//   2. Plurals             chidings -> chiding (+1 after s, z, x, ch, sh, ge, ce)
//   3. -ed                 flitted -> flit (+1 after t or d, as in "wanted")
//   4. -ing                straggling -> straggle (+1, but +0 after a consonant + le)
//   5. -er, -est           franker -> frank (+1); happier -> happy
//   6. -ly                 sturdily -> sturdy (+1)
//   7. -like -less -ness -ful   flamelike -> flame (+1)
// Words with anything but letters (numbers, apostrophes) and stems under three letters are left
// unknown.

const MIN_STEM = 3;

const SIBILANT_END = /(?:s|z|x|ch|sh|ge|ce|se|ze)$/;
/** Whether a spelled stem ends in a t or d sound, so that adding -ed adds a syllable. */
const T_OR_D_END = /[td]e?$/;
const CONSONANT_LE = /[^aeiou]le$/;

/** "flitt" -> "flit": a final doubled consonant, as written before -ed and -ing. */
const undouble = (stem: string) => (/([b-df-hj-np-tv-z])\1$/.test(stem) ? stem.slice(0, -1) : stem);

interface Estimate {
  counts: number[];
  from: string;
}

function spellingVariants(key: string): string[] {
  const swaps: [RegExp, string][] = [
    [/our/g, 'or'],
    [/re(s|d)?$/, 'er$1'],
    [/is(e|ed|es|ing|ation|ations)$/, 'iz$1'],
    [/ll(ing|ed|er|ers|or)$/, 'l$1'],
  ];
  const single = swaps.map(([from, to]) => key.replace(from, to)).filter(v => v !== key);
  const all = swaps.reduce((word, [from, to]) => word.replace(from, to), key);
  return [...new Set([...single, all].filter(v => v !== key))];
}

function estimate(key: string, map: SyllableMap): Estimate | null {
  if (!/^[a-z]+$/.test(key)) return null;

  const found = (stem: string, add: (stem: string) => number): Estimate | null => {
    if (stem.length < MIN_STEM) return null;
    const counts = entryCounts(map, stem);
    return counts ? { counts: unique(plus(counts, add(stem))), from: stem } : null;
  };
  const first = (...tries: (Estimate | null)[]) => tries.find(t => t !== null) ?? null;

  // 1. Spelling variants: the variant's own counts.
  const variants = spellingVariants(key);
  for (const variant of variants) {
    const hit = found(variant, () => 0);
    if (hit) return hit;
  }

  // 2–7. Endings, on the word as written and on its variants.
  for (const word of [key, ...variants]) {
    const one = () => 1;
    let hit: Estimate | null = null;

    if (word.endsWith('s') && !word.endsWith('ss')) {
      const sibilantPlus = (stem: string) => (SIBILANT_END.test(stem) ? 1 : 0);
      hit = first(found(word.slice(0, -1), sibilantPlus), word.endsWith('es') ? found(word.slice(0, -2), sibilantPlus) : null);
    }
    if (!hit && word.endsWith('ed')) {
      const tdPlus = (stem: string) => (T_OR_D_END.test(stem) ? 1 : 0);
      const base = word.slice(0, -2);
      hit = first(found(base, tdPlus), found(undouble(base), tdPlus), found(word.slice(0, -1), tdPlus));
    }
    if (!hit && word.endsWith('ing')) {
      const base = word.slice(0, -3);
      const ingPlus = (stem: string) => (CONSONANT_LE.test(stem) ? 0 : 1);
      hit = first(found(base, one), found(undouble(base), one), found(`${base}e`, ingPlus));
    }
    if (!hit && (word.endsWith('er') || word.endsWith('est'))) {
      const base = word.slice(0, word.endsWith('er') ? -2 : -3);
      const yForI = base.endsWith('i') ? `${base.slice(0, -1)}y` : base;
      hit = first(found(base, one), found(undouble(base), one), found(`${base}e`, one), found(yForI, one));
    }
    if (!hit && word.endsWith('ily')) hit = found(`${word.slice(0, -3)}y`, one);
    if (!hit && word.endsWith('ly')) hit = found(word.slice(0, -2), one);
    if (!hit) {
      for (const suffix of ['like', 'less', 'ness', 'ful']) {
        if (word.endsWith(suffix) && (hit = found(word.slice(0, -suffix.length), one))) break;
      }
    }
    if (hit) return hit;
  }
  return null;
}

/** A result that came from an estimate: never definite, with its own counts and where they came from. */
function fromEstimate(word: string, estimated: Estimate): SyllableResult {
  const confidence: SyllableConfidence = 'estimated';
  return estimated.counts.length === 1
    ? { word, count: estimated.counts[0], confidence, estimatedFrom: estimated.from }
    : { word, count: null, confidence, counts: estimated.counts, estimatedFrom: estimated.from };
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
export function lookupWord(rawWord: string, map: SyllableMap): SyllableResult {
  const key = toDictKey(rawWord);

  if (!key || /^[^a-z0-9]+$/.test(key)) {
    return { word: rawWord, count: null, confidence: 'unknown' };
  }

  // 1. Direct dictionary lookup
  const direct = entryCounts(map, key);
  if (direct) return fromCounts(rawWord, direct);

  // 2. Hyphenated word fallback: sum individual components (e.g. "honey-sweet"). A component the
  //    dictionary lacks may be estimated, which makes the whole word an estimate.
  if (key.includes('-')) {
    const parts = key.split('-').filter(Boolean);
    let totals = [0];
    let estimated = false;
    let allKnown = parts.length > 0;

    for (const part of parts) {
      let counts = entryCounts(map, part);
      if (!counts) {
        const guess = estimate(part, map);
        if (guess) {
          counts = guess.counts;
          estimated = true;
        }
      }
      if (!counts) {
        allKnown = false;
        break;
      }
      totals = unique(totals.flatMap(total => counts.map(c => total + c)));
    }

    if (allKnown) {
      return estimated ? fromEstimate(rawWord, { counts: totals, from: key }) : fromCounts(rawWord, totals);
    }
  }

  // 3. Possessive fallback (e.g. if "bessie's" is not in dict, try "bessie")
  if (key.endsWith("'s")) {
    const base = key.slice(0, -2);
    const baseCounts = entryCounts(map, base);
    if (baseCounts) {
      // In English, possessive 's adds a syllable after sibilants (s, z, x, ch, sh, ge)
      const addsSyllable = /(?:s|z|x|ch|sh|ge|ce)$/i.test(base);
      return fromCounts(rawWord, plus(baseCounts, addsSyllable ? 1 : 0));
    }
  }

  // 4. A word the dictionary lacks, worked out from a related one: an estimate, not a definite count.
  const guess = estimate(key, map);
  if (guess) return fromEstimate(rawWord, guess);

  // 5. Unknown word (e.g. archaic, foreign, or novel token)
  return { word: rawWord, count: null, confidence: 'unknown' };
}

/**
 * Counts syllables for a list of words, loading the dictionary only once.
 */
export async function countSyllablesBatch(words: string[]): Promise<SyllableResult[]> {
  const map = await getSyllableMap();
  return words.map(w => lookupWord(w, map));
}
