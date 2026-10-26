import { POEM_SCHEMA_VERSION, type Poem, type PoemDraft } from './index';
import { newId } from './uuid';

/** Only the fields of a draft are taken from it, so a whole poem passed in cannot bring its own id, times or revision. */
function content(draft: PoemDraft): PoemDraft {
  const copy: PoemDraft = {
    passageId: draft.passageId,
    retainedTokenIds: [...draft.retainedTokenIds],
    lineBreaks: [...draft.lineBreaks],
    erasureStyle: draft.erasureStyle,
  };
  if (draft.title !== undefined) copy.title = draft.title;
  if (draft.notes !== undefined) copy.notes = draft.notes;
  if (draft.passageVersion) copy.passageVersion = draft.passageVersion;
  return copy;
}

/** A draft as a new, stored poem: a fresh id, both times now, revision 1. For every repository to share. */
export function stampNew(draft: PoemDraft, now: Date = new Date()): Poem {
  const time = now.toISOString();
  return { ...content(draft), id: newId(), schemaVersion: POEM_SCHEMA_VERSION, revision: 1, createdAt: time, updatedAt: time };
}

/**
 * A draft as the next revision of a stored poem: the id and creation time are kept, the revision goes
 * up by one, and the passage version is kept if the draft says none.
 */
export function stampUpdate(existing: Poem, draft: PoemDraft, now: Date = new Date()): Poem {
  const next: Poem = {
    ...content(draft),
    id: existing.id,
    schemaVersion: POEM_SCHEMA_VERSION,
    revision: existing.revision + 1,
    createdAt: existing.createdAt,
    updatedAt: now.toISOString(),
  };
  if (!next.passageVersion && existing.passageVersion) next.passageVersion = existing.passageVersion;
  return next;
}
