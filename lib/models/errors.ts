import type { Poem } from './index';

/**
 * Why a poem could not be saved because it is over a limit (see LIMITS). The message is plain
 * language fit to show the writer. The `code` lets a screen tell this apart from other failures.
 */
export class PoemLimitError extends Error {
  readonly code = 'limit' as const;

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
export class PoemConflictError extends Error {
  readonly code = 'conflict' as const;

  constructor(readonly current: Poem) {
    super('This poem was changed somewhere else, for example in another tab. Open it again from My Collection to see the latest version.');
    this.name = 'PoemConflictError';
  }
}

/** A save to a poem that is no longer stored (deleted somewhere else). Nothing was saved, and nothing was re-created. */
export class PoemGoneError extends Error {
  readonly code = 'gone' as const;

  constructor() {
    super('This poem was deleted somewhere else, so it was not saved. You can save it again as a new poem.');
    this.name = 'PoemGoneError';
  }
}
