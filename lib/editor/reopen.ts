import { passageVersionOf, type Passage, type Poem } from '@/lib/models';
import type { EditorSnapshot } from './types';

export type ReopenResult =
  | { ok: true; snapshot: EditorSnapshot }
  | { ok: false; reason: 'passage-missing' | 'passage-changed' | 'token-mismatch'; message: string };

/**
 * Checks that a saved poem still fits the passage it was made from and, if so,
 * turns it into an editor snapshot. The poem is never modified or repaired: a
 * draft that no longer matches is refused and stays in storage untouched.
 *
 * `passage` is null when the poem's passage is not in the library. A poem that recorded the version
 * of the text it was made from is refused when the text has changed since, even if its words happen
 * to be found: the words it points at may no longer be the ones it was made from.
 */
export function reopenPoem(poem: Poem, passage: Pick<Passage, 'tokens' | 'sourceText'> | null): ReopenResult {
  const title = poem.title || 'Untitled';
  const passageTokens = passage?.tokens ?? null;

  if (!passage || !passageTokens) {
    return {
      ok: false,
      reason: 'passage-missing',
      message: `"${title}" was made from a passage that is no longer in the library.`,
    };
  }

  if (poem.passageVersion && poem.passageVersion !== passageVersionOf(passage)) {
    return {
      ok: false,
      reason: 'passage-changed',
      message: `"${title}" was made from an earlier version of this text, which has since changed, so it cannot be opened safely.`,
    };
  }

  const positionById = new Map<string, number>();
  for (const t of passageTokens) {
    if (t.isSelectable) positionById.set(t.id, t.position);
  }

  // Every retained token must exist in the passage, strictly in source order
  // (which also rules out duplicates).
  let lastPosition = -1;
  for (const id of poem.retainedTokenIds) {
    const position = positionById.get(id);
    if (position === undefined || position <= lastPosition) {
      return {
        ok: false,
        reason: 'token-mismatch',
        message: `"${title}" no longer matches the current text of its passage, so it cannot be opened safely.`,
      };
    }
    lastPosition = position;
  }

  return {
    ok: true,
    snapshot: {
      retainedTokenIds: [...poem.retainedTokenIds],
      lineBreaks: [...poem.lineBreaks],
      erasureStyle: poem.erasureStyle,
      title: poem.title ?? '',
      notes: poem.notes ?? '',
    },
  };
}
