
import { isUserId } from '@/lib/userTexts/id';

/**
 * Which passage the Discover page shows, carried in the URL hash so that a link, a reload and the
 * back button keep it: /discover#passage=walden-woods. Like the Studio hand-off it is untrusted
 * input: it is matched against a fixed pattern and then against the library.
 */
const PATTERN = /^passage=([a-z0-9][a-z0-9-]{0,63})$/;

/** Where "see the poems in this passage" should lead. */
export function discoverHref(passageId: string): string {
  return `/discover#passage=${passageId}`;
}

/** The hash to put in the address bar for a passage. */
export function discoverHash(passageId: string): string {
  return `#passage=${passageId}`;
}

/** The id of the passage a hash names, if it has the shape of one, whether or not a library has it. */
export function passageIdFromHash(hash: string): string | null {
  const match = PATTERN.exec(hash.startsWith('#') ? hash.slice(1) : hash);
  return match ? match[1] : null;
}

/** The passage a hash names, or null if it names none (or one that is not in the library). */
export function readDiscoverPassage<T extends { id: string }>(hash: string, passages: readonly T[]): T | null {
  const match = PATTERN.exec(hash.startsWith('#') ? hash.slice(1) : hash);
  return match ? (passages.find(p => p.id === match[1]) ?? null) : null;
}

/**
 * The passage a hash names when the library lists only the bundled passages: one of those, or an excerpt of a text the
 * reader added (which is asked for by its id: it is not in the list).
 */
export function passageIdForHash(hash: string, passages: readonly { id: string }[]): string | null {
  const id = passageIdFromHash(hash);
  if (id === null) return null;
  return passages.some(p => p.id === id) || isUserId(id) ? id : null;
}
