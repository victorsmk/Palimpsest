import type { Poem } from './index';

/** Why a repository could not do what it was asked. A screen tells these apart by `code`. */
export type RepositoryErrorCode = 'limit' | 'conflict' | 'gone' | 'storage' | 'offline' | 'unauthorized' | 'rate-limited' | 'unavailable';

/**
 * Anything a repository can refuse or fail at, in words fit to show the writer. Every repository,
 * whatever stores the poems behind it, reports these and nothing vaguer; see lib/errors/describe.ts for
 * what a screen says about each.
 */
export abstract class RepositoryError extends Error {
  abstract readonly code: RepositoryErrorCode;
  /** Whether doing the same thing again, a moment later, could work. */
  abstract readonly retryable: boolean;
}

/**
 * Why a poem could not be saved because it is over a limit (see LIMITS). The message is plain
 * language fit to show the writer. The `code` lets a screen tell this apart from other failures.
 */
export class PoemLimitError extends RepositoryError {
  readonly code = 'limit' as const;
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'PoemLimitError';
  }
}

/**
 * A save that started from an out-of-date copy of a poem: it was changed somewhere else (another
 * tab, later another device) after the writer opened it. Nothing was saved. `current` is the poem as
 * it is stored now.
 */
export class PoemConflictError extends RepositoryError {
  readonly code = 'conflict' as const;
  readonly retryable = false;

  constructor(readonly current: Poem) {
    super('This poem was changed somewhere else, for example in another tab. Open it again from My Collection to see the latest version.');
    this.name = 'PoemConflictError';
  }
}

/** A save to a poem that is no longer stored (deleted somewhere else). Nothing was saved, and nothing was re-created. */
export class PoemGoneError extends RepositoryError {
  readonly code = 'gone' as const;
  readonly retryable = false;

  constructor() {
    super('This poem was deleted somewhere else, so it was not saved. You can save it again as a new poem.');
    this.name = 'PoemGoneError';
  }
}

export type StorageFailure = 'full' | 'blocked' | 'other';

const STORAGE_MESSAGES: Record<StorageFailure, string> = {
  full: 'Your browser has no room left to store this. Delete some poems, or back up and clear space, then try again.',
  blocked: 'Your browser is not letting this site store anything, for example in a private window. Your poem has not been saved.',
  other: 'Your browser could not store this, so nothing was saved.',
};

/** What a failed write to the browser's storage most likely means, from the error it threw. */
export function storageFailureOf(cause: unknown): StorageFailure {
  const name = (cause as { name?: unknown } | null)?.name;
  const code = (cause as { code?: unknown } | null)?.code;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014) return 'full';
  if (name === 'SecurityError' || name === 'NotAllowedError') return 'blocked';
  return 'other';
}

/** The place the poems are kept refused to take them: it is full, blocked, or failed. Nothing was changed. */
export class StorageError extends RepositoryError {
  readonly code = 'storage' as const;
  readonly retryable: boolean;

  constructor(readonly failure: StorageFailure, options?: { cause?: unknown }) {
    super(STORAGE_MESSAGES[failure], options);
    this.name = 'StorageError';
    this.retryable = failure === 'other';
  }
}

/** There is no connection, so a request could not be made. Only a repository that uses the network reports it. */
export class OfflineError extends RepositoryError {
  readonly code = 'offline' as const;
  readonly retryable = true;

  constructor(options?: { cause?: unknown }) {
    super('You appear to be offline. Check your connection.', options);
    this.name = 'OfflineError';
  }
}

/** The writer is not signed in, or their session has ended. */
export class UnauthorizedError extends RepositoryError {
  readonly code = 'unauthorized' as const;
  readonly retryable = false;

  constructor() {
    super('You need to sign in to do this.');
    this.name = 'UnauthorizedError';
  }
}

/** The server asked for fewer requests. */
export class RateLimitedError extends RepositoryError {
  readonly code = 'rate-limited' as const;
  readonly retryable = false;

  constructor() {
    super('Too many requests just now. Wait a moment, then try again.');
    this.name = 'RateLimitedError';
  }
}

/** The server failed or could not be reached. */
export class UnavailableError extends RepositoryError {
  readonly code = 'unavailable' as const;
  readonly retryable = true;

  constructor(options?: { cause?: unknown }) {
    super('The server could not be reached.', options);
    this.name = 'UnavailableError';
  }
}
