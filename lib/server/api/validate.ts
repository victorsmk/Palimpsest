import { LIMITS, POEM_SCHEMA_VERSION, type ErasureStyle, type Poem, type PoemDraft } from '@/lib/models';
import { parseStoredPoem } from '@/lib/models/poemValidation';

/**
 * What the server will accept from a request. The browser is not trusted: everything is checked here,
 * whatever the screens already checked. A request that is wrong in shape is a 400 (the client has a
 * bug, or is not our client); one that is over a limit is a 422 with a message the writer can be shown.
 * Nothing is repaired or cut: what is not right is refused.
 */
export type Checked<T> = { ok: true; value: T } | { ok: false; status: 400 | 422; message: string };

const ERASURE_STYLES: readonly ErasureStyle[] = ['blackout', 'faded', 'whiteout'];
const PASSAGE_VERSION = /^t\d{1,4}-[0-9a-f]{16}$/;
/** Ids of passages, words and poems: the characters this app makes, nothing that could mean something else. */
export const SAFE_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const TOKEN_ID_MAX = 200;
/** Control characters, except the tab and the line breaks a person can type. The database cannot hold NUL at all. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const bad = (message: string): { ok: false; status: 400; message: string } => ({ ok: false, status: 400, message });
const over = (message: string): { ok: false; status: 422; message: string } => ({ ok: false, status: 422, message });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function tokenIds(value: unknown, what: string): Checked<string[]> {
  if (!Array.isArray(value)) return bad(`${what} must be a list.`);
  if (value.length > LIMITS.retainedMax) return over(`A poem can keep at most ${LIMITS.retainedMax.toLocaleString('en-US')} words.`);
  for (const id of value) {
    if (typeof id !== 'string' || id === '' || id.length > TOKEN_ID_MAX || CONTROL.test(id)) return bad(`${what} has a word that is not valid.`);
  }
  return { ok: true, value: value as string[] };
}

/** The content of a poem a writer sends to be saved: no id, times or revision, which only the server assigns. */
export function validateDraft(raw: unknown): Checked<PoemDraft> {
  if (!isRecord(raw)) return bad('The poem must be an object.');
  if (typeof raw.passageId !== 'string' || !SAFE_ID.test(raw.passageId)) return bad('The poem needs a passage.');
  if (!ERASURE_STYLES.includes(raw.erasureStyle as ErasureStyle)) return bad('The poem needs an erasure style.');

  const retained = tokenIds(raw.retainedTokenIds, 'The kept words');
  if (!retained.ok) return retained;
  const breaks = tokenIds(raw.lineBreaks, 'The line breaks');
  if (!breaks.ok) return breaks;
  const kept = new Set(retained.value);
  if (!breaks.value.every(id => kept.has(id))) return bad('A line break must follow a kept word.');

  const draft: PoemDraft = {
    passageId: raw.passageId,
    retainedTokenIds: retained.value,
    lineBreaks: breaks.value,
    erasureStyle: raw.erasureStyle as ErasureStyle,
  };

  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string') return bad('The title must be text.');
    if (raw.title.length > LIMITS.titleMax) return over(`A title can be at most ${LIMITS.titleMax} characters.`);
    if (CONTROL.test(raw.title)) return bad('The title has a character that is not allowed.');
    draft.title = raw.title;
  }
  if (raw.notes !== undefined) {
    if (typeof raw.notes !== 'string') return bad('The notes must be text.');
    if (raw.notes.length > LIMITS.notesMax) return over(`Notes can be at most ${LIMITS.notesMax.toLocaleString('en-US')} characters.`);
    if (CONTROL.test(raw.notes)) return bad('The notes have a character that is not allowed.');
    draft.notes = raw.notes;
  }
  if (raw.passageVersion !== undefined) {
    if (typeof raw.passageVersion !== 'string' || !PASSAGE_VERSION.test(raw.passageVersion)) return bad('The passage version is not valid.');
    draft.passageVersion = raw.passageVersion;
  }
  return { ok: true, value: draft };
}

/** Whole poems to be added as they are (restoring a backup): each one checked as strictly as a stored poem, and as a draft. */
export function validatePoems(raw: unknown): Checked<Poem[]> {
  if (!isRecord(raw) || !Array.isArray(raw.poems)) return bad('The request must hold a list of poems.');
  if (raw.poems.length > LIMITS.poemsMax) return over(`A collection can hold up to ${LIMITS.poemsMax.toLocaleString('en-US')} poems.`);
  const poems: Poem[] = [];
  const seen = new Set<string>();
  for (const entry of raw.poems) {
    const parsed = parseStoredPoem(entry);
    // Only poems that are already version 2 are taken: older ones were upgraded by the reader of the file.
    if (!parsed || parsed.poem.id !== parsed.storedId || (entry as { schemaVersion?: unknown }).schemaVersion !== POEM_SCHEMA_VERSION) {
      return bad('A poem in the list is not valid.');
    }
    const poem = { ...parsed.poem };
    // A title longer than the limit is cut, as it always was when saving (older poems may have one).
    if (poem.title !== undefined && poem.title.length > LIMITS.titleMax) poem.title = poem.title.slice(0, LIMITS.titleMax).trimEnd();
    if (!SAFE_ID.test(poem.id) || poem.id === '__proto__') return bad('A poem in the list has an id that is not allowed.');
    if (seen.has(poem.id)) return bad('A poem is in the list twice.');
    seen.add(poem.id);
    const content = validateDraft(poem);
    if (!content.ok) return content;
    if (poem.passageVersion !== undefined && !PASSAGE_VERSION.test(poem.passageVersion)) return bad('A poem in the list is not valid.');
    poems.push(poem);
  }
  return { ok: true, value: poems };
}

/** A list of poem ids to look up. */
export function validateIds(raw: unknown): Checked<string[]> {
  if (!isRecord(raw) || !Array.isArray(raw.ids)) return bad('The request must hold a list of ids.');
  if (raw.ids.length > LIMITS.poemsMax) return bad('Too many ids.');
  for (const id of raw.ids) if (typeof id !== 'string' || !SAFE_ID.test(id)) return bad('An id is not valid.');
  return { ok: true, value: raw.ids as string[] };
}

/** The `limit` and `after` of a list request, as the repository takes them. Anything else is ignored; limits are clamped by the repository. */
export function pageRequestOf(url: URL): { after?: string; limit?: number } {
  const request: { after?: string; limit?: number } = {};
  const after = url.searchParams.get('after');
  if (after !== null) request.after = after;
  const limit = url.searchParams.get('limit');
  if (limit !== null && /^\d{1,9}$/.test(limit)) request.limit = Number(limit);
  return request;
}

/** The revision a save says it started from, from an `If-Match` header such as `3`, `"3"` or `W/"3"`. */
export function revisionOfIfMatch(header: string | null): number | 'missing' | 'invalid' {
  if (header === null || header.trim() === '') return 'missing';
  const match = /^(?:W\/)?(?:"(\d{1,9})"|(\d{1,9}))$/.exec(header.trim());
  if (!match) return 'invalid';
  const revision = Number(match[1] ?? match[2]);
  return revision >= 1 ? revision : 'invalid';
}
