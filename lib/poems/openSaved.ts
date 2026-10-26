import type { Passage, Poem } from '@/lib/models';
import { reopenPoem, type EditorSnapshot } from '@/lib/editor';
import { SAVED_MISSING_MESSAGE, SAVED_UNREADABLE_MESSAGE } from '@/lib/handoff';

export type OpenedSavedPoem =
  | { ok: true; poem: Poem; passage: Passage; snapshot: EditorSnapshot }
  | { ok: false; message: string };

/**
 * Finds one of the writer's saved poems and checks that it still fits its passage, ready to open in
 * the editor. A poem that is gone, or no longer matches its book, is refused with a plain message and
 * nothing is repaired: the stored poem is left exactly as it is.
 */
export async function openSavedPoem(
  id: string,
  passages: Passage[],
  collection: { getPoem(id: string): Promise<Poem | null> }
): Promise<OpenedSavedPoem> {
  let poem: Poem | null;
  try {
    poem = await collection.getPoem(id);
  } catch {
    return { ok: false, message: SAVED_UNREADABLE_MESSAGE };
  }
  if (!poem) return { ok: false, message: SAVED_MISSING_MESSAGE };

  const passage = passages.find(p => p.id === poem.passageId);
  const reopened = reopenPoem(poem, passage?.tokens ?? null);
  if (!reopened.ok || !passage) {
    return { ok: false, message: reopened.ok ? 'Draft could not be opened.' : reopened.message };
  }
  return { ok: true, poem, passage, snapshot: reopened.snapshot };
}
