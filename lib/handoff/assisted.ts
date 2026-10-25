import type { Passage } from '@/lib/models';
import type { AssistedCandidate } from '@/lib/search/assisted';
import {
  FOUND_HANDOFF_MISMATCH_MESSAGE,
  FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE,
  type FoundHandoffResult,
} from './found';

/**
 * Hand-off of an Assisted poem to the Studio, carried in the URL hash:
 *
 *   /studio#assisted=walden-woods:14-17,20,23-25:17,20
 *                    passage ^     kept words ^   ^ line breaks fall after these
 *
 * An Assisted poem keeps scattered words, so the link lists every kept word: a position, or a run
 * of consecutive positions written first-last. Positions are the numbers inside token IDs
 * (`walden-woods-token-0014`), the same stable identity saved poems use. Like every hand-off the
 * link is untrusted input: it is parsed strictly and checked against the passage before use.
 */
export interface AssistedHandoff {
  passageId: string;
  /** Positions of the kept words, strictly ascending. */
  keptPositions: number[];
  /** Positions of the kept words a line break follows, strictly ascending. */
  breakAfterPositions: number[];
}

export const ASSISTED_PREFIX = 'assisted=';

/** The most words one poem may keep in a link. A 5-7-5 poem keeps at most 17. */
const MAX_KEPT = 40;

const PART = '\\d{1,6}(?:-\\d{1,6})?';
// Passage id, then up to 40 comma-separated words or runs, then zero or more break positions.
const PATTERN = new RegExp(
  `^assisted=([a-z0-9][a-z0-9-]{0,63}):(${PART}(?:,${PART}){0,${MAX_KEPT - 1}}):((?:\\d{1,6}(?:,\\d{1,6}){0,49})?)$`
);

/** The words of a candidate and the two line breaks, as a hand-off. */
export function assistedHandoffFromCandidate(candidate: AssistedCandidate): AssistedHandoff {
  const lines = [candidate.line1, candidate.line2, candidate.line3];
  return {
    passageId: candidate.passageId,
    keptPositions: lines.flatMap(line => line.tokens.map(t => t.position)),
    breakAfterPositions: [candidate.line1, candidate.line2].map(line => line.tokens[line.tokens.length - 1].position),
  };
}

/** Runs of three or more consecutive positions are written first-last, anything shorter one by one. */
function writeKept(positions: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < positions.length; ) {
    let j = i;
    while (j + 1 < positions.length && positions[j + 1] === positions[j] + 1) j++;
    if (j - i >= 2) parts.push(`${positions[i]}-${positions[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(positions[k]));
    i = j + 1;
  }
  return parts.join(',');
}

/** The hash payload, without the leading "#". */
export function encodeAssistedHandoff(handoff: AssistedHandoff): string {
  return `${ASSISTED_PREFIX}${handoff.passageId}:${writeKept(handoff.keptPositions)}:${handoff.breakAfterPositions.join(',')}`;
}

export function assistedHandoffHref(handoff: AssistedHandoff, path = '/studio'): string {
  return `${path}#${encodeAssistedHandoff(handoff)}`;
}

/** Parses a hash (with or without "#"). Null unless it is exactly a well-formed hand-off. */
export function decodeAssistedHandoff(hash: string): AssistedHandoff | null {
  const match = PATTERN.exec(hash.startsWith('#') ? hash.slice(1) : hash);
  if (!match) return null;

  const keptPositions: number[] = [];
  for (const part of match[2].split(',')) {
    const [from, to = from] = part.split('-').map(Number);
    if (to < from) return null;
    if (keptPositions.length + (to - from + 1) > MAX_KEPT) return null;
    for (let position = from; position <= to; position++) {
      if (keptPositions.length > 0 && position <= keptPositions[keptPositions.length - 1]) return null; // ascending, no repeats
      keptPositions.push(position);
    }
  }

  const breakAfterPositions = match[3] ? match[3].split(',').map(Number) : [];
  const last = keptPositions[keptPositions.length - 1];
  for (let i = 0; i < breakAfterPositions.length; i++) {
    const position = breakAfterPositions[i];
    const ascending = i === 0 || position > breakAfterPositions[i - 1];
    // A break follows a word of the poem, and not its last word.
    if (!ascending || !keptPositions.includes(position) || position === last) return null;
  }
  return { passageId: match[1], keptPositions, breakAfterPositions };
}

/**
 * Checks a hand-off against the library and turns it into an editor snapshot: exactly the named
 * words kept, the named line breaks, the default erasure style, no title. Nothing is repaired: a
 * hand-off naming a position that is missing or is not a word is refused.
 */
export function resolveAssistedHandoff(handoff: AssistedHandoff, passages: Passage[]): FoundHandoffResult {
  const passage = passages.find(p => p.id === handoff.passageId);
  if (!passage) {
    return { ok: false, reason: 'passage-missing', message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE };
  }
  const mismatch = (): FoundHandoffResult => ({
    ok: false,
    reason: 'token-mismatch',
    message: FOUND_HANDOFF_MISMATCH_MESSAGE,
  });

  const byPosition = new Map(passage.tokens.map(t => [t.position, t]));
  const ids = new Map<number, string>();
  for (const position of handoff.keptPositions) {
    const token = byPosition.get(position);
    if (!token?.isSelectable || token.kind !== 'word') return mismatch();
    ids.set(position, token.id);
  }
  const lineBreaks: string[] = [];
  for (const position of handoff.breakAfterPositions) {
    const id = ids.get(position);
    if (id === undefined) return mismatch();
    lineBreaks.push(id);
  }

  return {
    ok: true,
    passage,
    snapshot: {
      retainedTokenIds: handoff.keptPositions.map(p => ids.get(p)!),
      lineBreaks,
      erasureStyle: 'blackout',
      title: '',
      notes: '',
    },
  };
}
