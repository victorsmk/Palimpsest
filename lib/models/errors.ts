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
