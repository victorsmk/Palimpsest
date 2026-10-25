import type { ErasureStyle, Passage } from '@/lib/models';
import type { EditorSnapshot } from '@/lib/editor';
import {
  FOUND_HANDOFF_MISMATCH_MESSAGE,
  FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE,
  type FoundHandoffResult,
} from './found';
import { breaksPattern, keptPattern, readBreaks, readKept, writeKept } from './positions';

/**
 * A poem someone made, as a link that opens it in the Studio:
 *
 *   /studio#poem=walden-woods:14-16,20,23-25:16,20:b:Quiet%20Woods
 *            passage ^      kept words ^     ^ breaks ^ style ^ title (URL-encoded, may be empty)
 *
 * The link carries the poem itself and nothing else: which words of the passage are kept (by
 * position, as in every link), where the lines break, the erasure style (b blackout, f faded,
 * w whiteout) and the title. Notes are never in it. The reader needs the same book, which is true of
 * the bundled library. Like every link it is untrusted input: it is parsed strictly and checked
 * against the passage before anything opens.
 */
export interface SharedPoem {
  passageId: string;
  /** Positions of the kept words, strictly ascending. */
  keptPositions: number[];
  /** Positions of the kept words a line break follows, strictly ascending, never the last word. */
  breakAfterPositions: number[];
  erasureStyle: ErasureStyle;
  /** The poem's title, one line, at most MAX_SHARED_TITLE characters; empty for none. */
  title: string;
}

export const SHARED_PREFIX = 'poem=';
/** The most words a shared poem may keep. Beyond it a link would be unwieldy. */
export const MAX_SHARED_WORDS = 300;
export const MAX_SHARED_TITLE = 120;

export const SHARE_EMPTY_MESSAGE = 'Keep at least one word to share your poem.';
export const SHARE_TOO_LONG_MESSAGE =
  'This poem is too long to share by link. Use Print / Save as PDF, or download it as text.';

const STYLE_CODE: Record<ErasureStyle, string> = { blackout: 'b', faded: 'f', whiteout: 'w' };
const STYLE_OF: Record<string, ErasureStyle> = { b: 'blackout', f: 'faded', w: 'whiteout' };

// What encodeURIComponent writes, up to the length the longest title could take (3 bytes a character, 3 characters a byte).
const ENCODED_TITLE = `[A-Za-z0-9\\-_.!~*'()%]{0,${MAX_SHARED_TITLE * 9}}`;
const PATTERN = new RegExp(
  `^poem=([a-z0-9][a-z0-9-]{0,63}):(${keptPattern(MAX_SHARED_WORDS)}):(${breaksPattern(MAX_SHARED_WORDS)}):([bfw]):(${ENCODED_TITLE})$`
);

// Control characters, and the two Unicode line separators, built from escapes so that none is written out.
const CONTROL_CHARACTERS = new RegExp('[\u0000-\u001f\u007f-\u009f\u2028\u2029]');

/** One line, trimmed, within the limit. */
export function cleanSharedTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, MAX_SHARED_TITLE).trimEnd();
}

export type ShareResult =
  | { ok: true; poem: SharedPoem }
  | { ok: false; reason: 'empty' | 'too-long'; message: string };

/** The poem on screen as something to share. Refuses an empty poem and one too long for a link. */
export function sharedPoemFromEditor(
  passage: Pick<Passage, 'id' | 'tokens'>,
  snapshot: Pick<EditorSnapshot, 'retainedTokenIds' | 'lineBreaks' | 'erasureStyle' | 'title'>
): ShareResult {
  const positionOf = new Map(passage.tokens.map(t => [t.id, t.position]));
  const kept = snapshot.retainedTokenIds
    .map(id => positionOf.get(id))
    .filter((p): p is number => p !== undefined)
    .sort((a, b) => a - b);
  if (kept.length === 0) return { ok: false, reason: 'empty', message: SHARE_EMPTY_MESSAGE };
  if (kept.length > MAX_SHARED_WORDS) return { ok: false, reason: 'too-long', message: SHARE_TOO_LONG_MESSAGE };

  const keptSet = new Set(kept);
  const last = kept[kept.length - 1];
  const breaks = snapshot.lineBreaks
    .map(id => positionOf.get(id))
    .filter((p): p is number => p !== undefined && keptSet.has(p) && p !== last)
    .sort((a, b) => a - b);

  return {
    ok: true,
    poem: {
      passageId: passage.id,
      keptPositions: kept,
      breakAfterPositions: [...new Set(breaks)],
      erasureStyle: snapshot.erasureStyle,
      title: cleanSharedTitle(snapshot.title),
    },
  };
}

/** The hash payload, without the leading "#". */
export function encodeSharedPoem(poem: SharedPoem): string {
  return [
    `${SHARED_PREFIX}${poem.passageId}`,
    writeKept(poem.keptPositions),
    poem.breakAfterPositions.join(','),
    STYLE_CODE[poem.erasureStyle],
    encodeURIComponent(poem.title),
  ].join(':');
}

/** The link, relative to the site (add the site's address in front to share it). */
export function sharedPoemHref(poem: SharedPoem, path = '/studio'): string {
  return `${path}#${encodeSharedPoem(poem)}`;
}

/** Parses a hash (with or without "#"). Null unless it is exactly a well-formed shared poem. */
export function decodeSharedPoem(hash: string): SharedPoem | null {
  const match = PATTERN.exec(hash.startsWith('#') ? hash.slice(1) : hash);
  if (!match) return null;

  const keptPositions = readKept(match[2], MAX_SHARED_WORDS);
  if (!keptPositions) return null;
  const breakAfterPositions = readBreaks(match[3], keptPositions);
  if (!breakAfterPositions) return null;

  let title: string;
  try {
    title = decodeURIComponent(match[5]);
  } catch {
    return null;
  }
  // One plain line of the allowed length: no line breaks or control characters, not padded, not cut.
  if (title.length > MAX_SHARED_TITLE || CONTROL_CHARACTERS.test(title) || title !== title.trim()) return null;

  return { passageId: match[1], keptPositions, breakAfterPositions, erasureStyle: STYLE_OF[match[4]], title };
}

/**
 * Checks a shared poem against the library and turns it into an editor snapshot: exactly the named
 * words kept, the named breaks, its style and its title, and no notes. Nothing is repaired: a link
 * naming a position that is missing or is not a word is refused.
 */
export function resolveSharedPoem(poem: SharedPoem, passages: Passage[]): FoundHandoffResult {
  const passage = passages.find(p => p.id === poem.passageId);
  if (!passage) {
    return { ok: false, reason: 'passage-missing', message: FOUND_HANDOFF_PASSAGE_MISSING_MESSAGE };
  }
  const mismatch = (): FoundHandoffResult => ({ ok: false, reason: 'token-mismatch', message: FOUND_HANDOFF_MISMATCH_MESSAGE });

  const byPosition = new Map(passage.tokens.map(t => [t.position, t]));
  const ids = new Map<number, string>();
  for (const position of poem.keptPositions) {
    const token = byPosition.get(position);
    if (!token?.isSelectable || token.kind !== 'word') return mismatch();
    ids.set(position, token.id);
  }
  const lineBreaks: string[] = [];
  for (const position of poem.breakAfterPositions) {
    const id = ids.get(position);
    if (id === undefined) return mismatch();
    lineBreaks.push(id);
  }

  return {
    ok: true,
    passage,
    snapshot: {
      retainedTokenIds: poem.keptPositions.map(p => ids.get(p)!),
      lineBreaks,
      erasureStyle: poem.erasureStyle,
      title: poem.title,
      notes: '',
    },
  };
}
