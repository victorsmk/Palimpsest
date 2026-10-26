import type { Passage } from '@/lib/models';
import { ASSISTED_PREFIX, decodeAssistedHandoff, resolveAssistedHandoff } from './assisted';
import { FOUND_HANDOFF_INVALID_MESSAGE, decodeFoundHandoff, readFoundHandoff, type ReadHandoff } from './found';
import { SHARED_PREFIX, decodeSharedPoem, resolveSharedPoem } from './shared';

/**
 * The passage a hand-off hash names (`#found=`, `#assisted=` or `#poem=`), or null if the hash is not
 * a well-formed hand-off. Read before the passage itself is loaded, to know which one to load; it
 * checks nothing else (the words are checked against the passage by readHandoff).
 */
export function handoffPassageId(hash: string): string | null {
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;
  if (payload.startsWith(SHARED_PREFIX)) return decodeSharedPoem(payload)?.passageId ?? null;
  if (payload.startsWith(ASSISTED_PREFIX)) return decodeAssistedHandoff(payload)?.passageId ?? null;
  return decodeFoundHandoff(payload)?.passageId ?? null;
}

/**
 * What a page should do with its current URL hash, for a poem sent from Discover (`#found=`), from
 * the Assisted page (`#assisted=`), or shared by link (`#poem=`). Hashes that are not a hand-off (page anchors, nothing at all) are
 * left alone; one that claims to be a hand-off but is not usable is reported.
 */
export function readHandoff(hash: string, passages: Passage[]): ReadHandoff {
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;

  if (payload.startsWith(SHARED_PREFIX)) {
    const shared = decodeSharedPoem(payload);
    if (!shared) return { kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE };
    const result = resolveSharedPoem(shared, passages);
    return result.ok
      ? { kind: 'open', mode: 'shared', passage: result.passage, snapshot: result.snapshot }
      : { kind: 'invalid', message: result.message };
  }

  if (!payload.startsWith(ASSISTED_PREFIX)) return readFoundHandoff(hash, passages);

  const handoff = decodeAssistedHandoff(payload);
  if (!handoff) return { kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE };

  const result = resolveAssistedHandoff(handoff, passages);
  return result.ok
    ? { kind: 'open', mode: 'assisted', passage: result.passage, snapshot: result.snapshot }
    : { kind: 'invalid', message: result.message };
}
