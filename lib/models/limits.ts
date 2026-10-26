/**
 * The limits on what a poem and a collection may hold. One set, here, for every layer: the screens
 * stop typing at them, the service refuses what goes past them, and a server must apply the same
 * numbers. They are checked when something is WRITTEN. Reading is lenient, so that a poem saved
 * before a limit existed is never made unreadable by one.
 */
export const LIMITS = {
  /** Characters in a poem's title. A longer title is cut to this. */
  titleMax: 120,
  /** Characters in a poem's notes. Longer notes are refused, never silently cut. */
  notesMax: 10_000,
  /** Words one poem may keep. Far above any passage; a guard against absurd input. */
  retainedMax: 10_000,
  /** Poems one collection may hold. */
  poemsMax: 2_000,
  /** Bytes in a backup file. */
  backupBytesMax: 5 * 1024 * 1024,
} as const;
