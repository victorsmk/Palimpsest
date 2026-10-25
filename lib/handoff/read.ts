import type { Passage } from '@/lib/models';
import { ASSISTED_PREFIX, decodeAssistedHandoff, resolveAssistedHandoff } from './assisted';
import { FOUND_HANDOFF_INVALID_MESSAGE, readFoundHandoff, type ReadHandoff } from './found';

/**
 * What a page should do with its current URL hash, for a poem sent from Discover (`#found=`) or from
 * the Assisted page (`#assisted=`). Hashes that are not a hand-off (page anchors, nothing at all) are
 * left alone; one that claims to be a hand-off but is not usable is reported.
 */
export function readHandoff(hash: string, passages: Passage[]): ReadHandoff {
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!payload.startsWith(ASSISTED_PREFIX)) return readFoundHandoff(hash, passages);

  const handoff = decodeAssistedHandoff(payload);
  if (!handoff) return { kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE };

  const result = resolveAssistedHandoff(handoff, passages);
  return result.ok
    ? { kind: 'open', mode: 'assisted', passage: result.passage, snapshot: result.snapshot }
    : { kind: 'invalid', message: result.message };
}
