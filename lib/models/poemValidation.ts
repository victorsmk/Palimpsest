import { POEM_SCHEMA_VERSION, type ErasureStyle, type Poem } from './index';
import { LIMITS } from './limits';

const ERASURE_STYLES: readonly ErasureStyle[] = ['blackout', 'faded', 'whiteout'];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Validates untrusted persisted data and returns a well-formed Poem, or null.
 *
 * Rejects entries that are malformed, internally inconsistent, or written by a
 * newer schema than this build understands. Older versions would be migrated
 * here; version 1 is the only one so far.
 */
export function parsePoem(raw: unknown): Poem | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  if (
    typeof r.schemaVersion !== 'number' ||
    !Number.isInteger(r.schemaVersion) ||
    r.schemaVersion < 1 ||
    r.schemaVersion > POEM_SCHEMA_VERSION
  ) {
    return null;
  }

  if (typeof r.id !== 'string' || r.id === '') return null;
  if (typeof r.passageId !== 'string' || r.passageId === '') return null;
  if (!isStringArray(r.retainedTokenIds) || !isStringArray(r.lineBreaks)) return null;
  if (!ERASURE_STYLES.includes(r.erasureStyle as ErasureStyle)) return null;
  if (!isIsoDate(r.createdAt) || !isIsoDate(r.updatedAt)) return null;
  if (r.title !== undefined && typeof r.title !== 'string') return null;
  if (r.notes !== undefined && typeof r.notes !== 'string') return null;

  // Line breaks only make sense after retained words.
  const retained = new Set(r.retainedTokenIds);
  if (!r.lineBreaks.every(id => retained.has(id))) return null;

  const poem: Poem = {
    id: r.id,
    schemaVersion: POEM_SCHEMA_VERSION,
    passageId: r.passageId,
    retainedTokenIds: r.retainedTokenIds,
    lineBreaks: r.lineBreaks,
    erasureStyle: r.erasureStyle as ErasureStyle,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
  if (r.title !== undefined) poem.title = r.title as string;
  if (r.notes !== undefined) poem.notes = r.notes as string;
  return poem;
}

/**
 * Whether a poem may be WRITTEN: null when it is within the limits, otherwise a plain message saying
 * which one it is over. (Reading is lenient; see LIMITS.) The title is not checked here, because a
 * title that is too long is cut to size rather than refused.
 */
export function poemLimitProblem(poem: Pick<Poem, 'notes' | 'retainedTokenIds'>): string | null {
  if ((poem.notes ?? '').length > LIMITS.notesMax) {
    return `Notes can be at most ${LIMITS.notesMax.toLocaleString('en-US')} characters.`;
  }
  if (poem.retainedTokenIds.length > LIMITS.retainedMax) {
    return `A poem can keep at most ${LIMITS.retainedMax.toLocaleString('en-US')} words.`;
  }
  return null;
}
