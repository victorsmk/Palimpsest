import type { Passage } from '@/lib/models';

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

/** The passage a hash names, or null if it names none (or one that is not in the library). */
export function readDiscoverPassage(hash: string, passages: Passage[]): Passage | null {
  const match = PATTERN.exec(hash.startsWith('#') ? hash.slice(1) : hash);
  return match ? (passages.find(p => p.id === match[1]) ?? null) : null;
}
