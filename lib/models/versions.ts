import { fingerprint, uuidV5 } from './uuid';

/**
 * Bump this whenever the way a text is cut into words changes (the tokenizer, how a word's id is
 * made). Every poem made before then refers to words that may no longer be the same, and is told
 * apart from poems made after by the passage version below.
 */
export const TOKENIZER_VERSION = 1;

const cache = new WeakMap<object, string>();

/**
 * The version of a passage: a fingerprint of its exact text together with the tokenizer's version,
 * such as "t1-9b1c0d2e3f4a5b6c". A poem records it when it is saved. If the text or the tokenizer
 * changes later, the version changes, and the poem can say so instead of quietly pointing at
 * different words.
 */
export function passageVersionOf(passage: { sourceText: string }): string {
  const known = cache.get(passage);
  if (known) return known;
  const version = `t${TOKENIZER_VERSION}-${fingerprint(passage.sourceText)}`;
  cache.set(passage, version);
  return version;
}

/** Fixed, so that an older poem's new id is the same on every reading, in every browser, forever. */
const LEGACY_ID_NAMESPACE = '6f5d2c1e-7b8a-4c3d-9e1f-2a4b6c8d0e1f';

/**
 * The id a poem made before version 2 gets, so that every poem has the same kind of id. It is worked
 * out from the old id, not chosen at random, so that reading the same old poem twice, in two tabs or
 * in a backup, gives the same new id (and a backup of old poems restores without adding twice).
 */
export function legacyPoemId(oldId: string): string {
  return uuidV5(LEGACY_ID_NAMESPACE, oldId);
}
