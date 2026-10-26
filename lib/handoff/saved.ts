import { FOUND_HANDOFF_INVALID_MESSAGE } from './found';

/**
 * A link that opens one of your own saved poems in the Studio, by its id:
 *
 *   /studio#open=poem-1761390000000-k3j9a
 *
 * Unlike a shared poem, which carries the poem inside the link, this names a poem that lives in this
 * browser's collection. Opening it keeps the poem's identity, so saving updates it instead of making
 * a copy, and its notes come with it. The id means nothing in another browser, which then says the
 * poem is not in its collection. The link is untrusted input: the id is held to a plain, safe form.
 */
export const SAVED_PREFIX = 'open=';

export const SAVED_MISSING_MESSAGE = 'That poem is no longer in your collection.';
export const SAVED_SIGN_IN_MESSAGE = 'Sign in to open your saved poems.';
export const SAVED_UNREADABLE_MESSAGE = 'Your collection could not be read. Please try again.';

/** The ids this app makes use letters, digits and a few separators; nothing else is accepted. */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export type OpenRequest =
  | { kind: 'none' }
  | { kind: 'invalid'; message: string }
  | { kind: 'poem'; id: string };

/** What a page should do with its URL hash: nothing, report a bad link, or open the named poem. */
export function readOpenRequest(hash: string): OpenRequest {
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!payload.startsWith(SAVED_PREFIX)) return { kind: 'none' };
  const id = payload.slice(SAVED_PREFIX.length);
  if (!SAFE_ID.test(id) || id === '__proto__') return { kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE };
  return { kind: 'poem', id };
}

/** The link to open a saved poem in the Studio. */
export function savedPoemHref(id: string, path = '/studio'): string {
  return `${path}#${SAVED_PREFIX}${id}`;
}
