import { UnauthorizedError, type Passage, type Poem } from '@/lib/models';
import { reopenPoem, type EditorSnapshot } from '@/lib/editor';
import { PASSAGE_UNAVAILABLE_MESSAGE, type PassageLibrary } from '@/lib/library/passageLibrary';
import { SAVED_MISSING_MESSAGE, SAVED_SIGN_IN_MESSAGE, SAVED_UNREADABLE_MESSAGE } from '@/lib/handoff';

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
  library: Pick<PassageLibrary, 'ensure' | 'get'>,
  collection: { getPoem(id: string): Promise<Poem | null> }
): Promise<OpenedSavedPoem> {
  let poem: Poem | null;
  try {
    poem = await collection.getPoem(id);
  } catch (error) {
    if (error instanceof UnauthorizedError) return { ok: false, message: SAVED_SIGN_IN_MESSAGE };
    return { ok: false, message: SAVED_UNREADABLE_MESSAGE };
  }
  if (!poem) return { ok: false, message: SAVED_MISSING_MESSAGE };

  // Only this poem's own passage is needed, so only it is loaded. One the library does not have is
  // left to reopenPoem to refuse; one that cannot be fetched is said so.
  try {
    await library.ensure([poem.passageId]);
  } catch {
    return { ok: false, message: PASSAGE_UNAVAILABLE_MESSAGE };
  }
  const passage = library.get(poem.passageId);
  const reopened = reopenPoem(poem, passage ?? null);
  if (!reopened.ok || !passage) {
    return { ok: false, message: reopened.ok ? 'Draft could not be opened.' : reopened.message };
  }
  return { ok: true, poem, passage, snapshot: reopened.snapshot };
}
