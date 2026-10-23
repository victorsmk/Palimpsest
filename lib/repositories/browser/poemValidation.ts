import { POEM_SCHEMA_VERSION, type ErasureStyle, type Poem } from '@/lib/models';

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
