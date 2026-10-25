import type { Poem } from '@/lib/models';
import { parsePoem } from '@/lib/repositories/browser/poemValidation';

/** What a backup file says it is, so that another file is not mistaken for one. */
export const BACKUP_FORMAT = 'palimpsest-backup';
/** The version of the backup layout this build writes and understands. */
export const BACKUP_VERSION = 1;
/** The largest backup that is read: a collection of thousands of poems is far smaller than this. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
/** The most poems one backup may hold. */
export const MAX_BACKUP_POEMS = 2000;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** When the backup was made, ISO 8601. */
  exportedAt: string;
  poems: Poem[];
}

/** The backup of a collection: every poem, whole. */
export function createBackup(poems: readonly Poem[], now: Date = new Date()): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), poems: [...poems] };
}

/** The text of a backup file. Indented, so that a person can open it and see their poems. */
export function serializeBackup(backup: BackupFile): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** "palimpsest-backup-2026-10-25.json", with the date as it is where the writer is. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `palimpsest-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type ReadBackupResult =
  | {
      ok: true;
      /** Poems that passed every check, once each. */
      poems: Poem[];
      /** Entries that were not well-formed poems, or had a name that is not allowed. */
      unreadable: number;
      /** Entries repeating the id of an earlier one in the file (the first is kept). */
      repeated: number;
    }
  | { ok: false; reason: 'too-large' | 'not-json' | 'not-a-backup' | 'newer-version' | 'too-many'; message: string };

const SAFE_ID = /^[A-Za-z0-9._:-]{1,100}$/;

const refuse = (reason: Extract<ReadBackupResult, { ok: false }>['reason'], message: string): ReadBackupResult => ({
  ok: false,
  reason,
  message,
});

/**
 * Reads a backup file's text. The file is untrusted: it is size-limited, parsed strictly, and every
 * poem in it goes through the same checks as one read from storage. A poem that fails is counted and
 * left out; nothing is repaired or guessed. Unknown fields are dropped.
 */
export function readBackup(text: string): ReadBackupResult {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    return refuse('too-large', 'That file is too large to be a Palimpsest backup.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuse('not-json', 'That file could not be read. It is not a Palimpsest backup.');
  }

  const notABackup = refuse('not-a-backup', 'That file is not a Palimpsest backup.');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return notABackup;
  const file = parsed as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT) return notABackup;
  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) return notABackup;
  if (file.version > BACKUP_VERSION) {
    return refuse('newer-version', 'That backup was made by a newer version of Palimpsest, which this one cannot read.');
  }
  if (!Array.isArray(file.poems)) return notABackup;
  if (file.poems.length > MAX_BACKUP_POEMS) {
    return refuse('too-many', `That backup has more than ${MAX_BACKUP_POEMS} poems, which is more than can be restored at once.`);
  }

  const poems: Poem[] = [];
  const seen = new Set<string>();
  let unreadable = 0;
  let repeated = 0;
  for (const entry of file.poems) {
    const poem = parsePoem(entry);
    // The id becomes a key in storage, so it is held to a plain, safe form ("__proto__" is not one).
    if (!poem || !SAFE_ID.test(poem.id) || poem.id === '__proto__') {
      unreadable++;
      continue;
    }
    if (seen.has(poem.id)) {
      repeated++;
      continue;
    }
    seen.add(poem.id);
    poems.push(poem);
  }
  return { ok: true, poems, unreadable, repeated };
}

/** Two poems are the same when everything about them matches; a missing title or notes is an empty one. */
export function samePoem(a: Poem, b: Poem): boolean {
  const key = (p: Poem) =>
    JSON.stringify([
      p.id,
      p.passageId,
      p.title ?? '',
      p.notes ?? '',
      p.erasureStyle,
      p.retainedTokenIds,
      p.lineBreaks,
      p.createdAt,
      p.updatedAt,
    ]);
  return key(a) === key(b);
}

export interface RestorePlan {
  /** Poems the collection does not have: these would be added. */
  toAdd: Poem[];
  /** Poems already in the collection exactly as they are in the backup. */
  alreadyHere: number;
  /** Poems with the same id as one in the collection but different: the collection's version is kept. */
  differentKept: number;
}

/** What restoring `incoming` into a collection that holds `existing` would do. It only ever adds. */
export function planRestore(existing: readonly Poem[], incoming: readonly Poem[]): RestorePlan {
  const have = new Map(existing.map(poem => [poem.id, poem]));
  const plan: RestorePlan = { toAdd: [], alreadyHere: 0, differentKept: 0 };
  for (const poem of incoming) {
    const current = have.get(poem.id);
    if (!current) plan.toAdd.push(poem);
    else if (samePoem(current, poem)) plan.alreadyHere++;
    else plan.differentKept++;
  }
  return plan;
}
