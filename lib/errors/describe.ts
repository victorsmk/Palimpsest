import { RepositoryError } from '@/lib/models';

/** What the writer was doing when something went wrong. */
export type Action = 'save' | 'rename' | 'duplicate' | 'delete' | 'backup' | 'restore' | 'open' | 'list';

const TRY_AGAIN = ' Please try again.';

/** What is said when the error is not one a repository reports: nothing is known except what was being done. */
const UNKNOWN: Record<Action, string> = {
  save: 'Could not save the draft.',
  rename: `Could not rename this poem.${TRY_AGAIN}`,
  duplicate: `Could not duplicate this poem.${TRY_AGAIN}`,
  delete: `This poem could not be deleted.${TRY_AGAIN}`,
  backup: `Could not create the backup.${TRY_AGAIN}`,
  restore: `The poems could not be added, and your collection has not been changed.${TRY_AGAIN}`,
  open: `Your collection could not be read.${TRY_AGAIN}`,
  list: `Your collection could not be read.${TRY_AGAIN}`,
};

/** For these, a poem that is gone is simply not in the collection (the writer chose it from a list or a link). */
const GONE_IS_MISSING: ReadonlySet<Action> = new Set(['rename', 'duplicate', 'open']);

export const POEM_MISSING_MESSAGE = 'That poem is no longer in your collection.';

/**
 * The one place that decides what the writer is told when something fails. An error a repository
 * reports says what happened in its own words; "Please try again." is added only when trying again
 * could help. Anything else gets a plain sentence about what was being done. A restore also says that
 * the collection was not changed, because a restore writes everything or nothing.
 */
export function describeError(error: unknown, action: Action): string {
  if (!(error instanceof RepositoryError)) return UNKNOWN[action];
  if (error.code === 'gone' && GONE_IS_MISSING.has(action)) return POEM_MISSING_MESSAGE;
  const retry = error.retryable ? TRY_AGAIN : '';
  const unchanged = action === 'restore' ? ' Your collection has not been changed.' : '';
  return `${error.message}${retry}${unchanged}`;
}
