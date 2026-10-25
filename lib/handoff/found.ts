import type { Passage } from '@/lib/models';
import type { EditorSnapshot } from '@/lib/editor';
import type { FoundCandidate } from '@/lib/search/found';

/**
 * Hand-off of a poem found in Discover to the Studio, carried in the URL hash:
 *
 *   /studio#found=walden-woods:14-28:16,23
 *            passage ^   first-last ^   ^ line breaks fall after these tokens
 *
 * A Found poem is one contiguous run of the passage, so the passage and the first and last token
 * positions are enough to say which words to keep. Positions are the numbers inside token IDs
 * (`walden-woods-token-0014`), so this uses the same stable identity as saved poems. The link is
 * untrusted input: it is parsed strictly and checked against the passage before anything is opened.
 */
export interface FoundHandoff {
  passageId: string;
  startPosition: number;
  endPosition: number;
  /** Positions of the tokens a line break follows, ascending. */
  breakAfterPositions: number[];
}

const PREFIX = 'found=';
// Passage id, first-last, then zero or more comma-separated break positions. Nothing else.
const PATTERN = /^found=([a-z0-9][a-z0-9-]{0,63}):(\d{1,6})-(\d{1,6}):((?:\d{1,6}(?:,\d{1,6}){0,49})?)$/;

export const FOUND_HANDOFF_INVALID_MESSAGE =
  'That link does not describe a poem the Studio can open.';
export const FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE =
  'That poem was found in a passage that is no longer in the library.';
export const FOUND_HANDOFF_MISMATCH_MESSAGE =
  'That poem no longer matches the current text of its passage, so it cannot be opened safely.';

/** What to hand over for a Found candidate: its words, with line breaks after lines 1 and 2. */
export function foundHandoffFromCandidate(candidate: FoundCandidate): FoundHandoff {
  const lastOf = (tokens: { position: number }[]) => tokens[tokens.length - 1].position;
  return {
    passageId: candidate.passageId,
    startPosition: candidate.startPosition,
    endPosition: candidate.endPosition,
    breakAfterPositions: [lastOf(candidate.line1.tokens), lastOf(candidate.line2.tokens)],
  };
}

/** The hash payload, without the leading "#". */
export function encodeFoundHandoff(handoff: FoundHandoff): string {
  return `${PREFIX}${handoff.passageId}:${handoff.startPosition}-${handoff.endPosition}:${handoff.breakAfterPositions.join(',')}`;
}

export function foundHandoffHref(handoff: FoundHandoff, path = '/studio'): string {
  return `${path}#${encodeFoundHandoff(handoff)}`;
}

/** Parses a hash (with or without "#"). Null unless it is exactly a well-formed hand-off. */
export function decodeFoundHandoff(hash: string): FoundHandoff | null {
  const match = PATTERN.exec(hash.startsWith('#') ? hash.slice(1) : hash);
  if (!match) return null;

  const startPosition = Number(match[2]);
  const endPosition = Number(match[3]);
  if (startPosition > endPosition) return null;

  const breakAfterPositions = match[4] ? match[4].split(',').map(Number) : [];
  for (let i = 0; i < breakAfterPositions.length; i++) {
    const position = breakAfterPositions[i];
    const ascending = i === 0 || position > breakAfterPositions[i - 1];
    // A break follows a word inside the poem, so it cannot follow the last one.
    if (!ascending || position < startPosition || position >= endPosition) return null;
  }
  return { passageId: match[1], startPosition, endPosition, breakAfterPositions };
}

export type FoundHandoffResult =
  | { ok: true; passage: Passage; snapshot: EditorSnapshot }
  | { ok: false; reason: 'passage-missing' | 'token-mismatch'; message: string };

/**
 * Checks a hand-off against the library and turns it into an editor snapshot: the words in the
 * range kept (separators such as em dashes are never kept), the breaks after the named words, the
 * default erasure style and no title. Nothing is repaired: a hand-off that does not fit is refused.
 */
export function resolveFoundHandoff(handoff: FoundHandoff, passages: Passage[]): FoundHandoffResult {
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
  const first = byPosition.get(handoff.startPosition);
  const last = byPosition.get(handoff.endPosition);
  if (!first?.isSelectable || !last?.isSelectable) return mismatch();

  const retained = passage.tokens.filter(
    t => t.isSelectable && t.position >= handoff.startPosition && t.position <= handoff.endPosition
  );

  const lineBreaks: string[] = [];
  for (const position of handoff.breakAfterPositions) {
    const token = byPosition.get(position);
    if (!token?.isSelectable || position < handoff.startPosition || position >= handoff.endPosition) {
      return mismatch();
    }
    lineBreaks.push(token.id);
  }

  return {
    ok: true,
    passage,
    snapshot: {
      retainedTokenIds: retained.map(t => t.id),
      lineBreaks,
      erasureStyle: 'blackout',
      title: '',
      notes: '',
    },
  };
}

export type ReadHandoff =
  | { kind: 'none' }
  | { kind: 'invalid'; message: string }
  /** `mode` is where the poem came from: Discover (found), the Assisted page, or a link someone shared. */
  | { kind: 'open'; mode: 'found' | 'assisted' | 'shared'; passage: Passage; snapshot: EditorSnapshot };

/**
 * What a page should do with its current URL hash. Hashes that are not a hand-off (page anchors,
 * nothing at all) are left alone; one that claims to be a hand-off but is not usable is reported.
 */
export function readFoundHandoff(hash: string, passages: Passage[]): ReadHandoff {
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!payload.startsWith(PREFIX)) return { kind: 'none' };

  const handoff = decodeFoundHandoff(payload);
  if (!handoff) return { kind: 'invalid', message: FOUND_HANDOFF_INVALID_MESSAGE };

  const result = resolveFoundHandoff(handoff, passages);
  return result.ok
    ? { kind: 'open', mode: 'found', passage: result.passage, snapshot: result.snapshot }
    : { kind: 'invalid', message: result.message };
}
