import { UserTextError } from './UserTexts';
import { RepositoryError } from '@/lib/models';

/** What the reader is told when their texts could not be read or deleted. (A text that cannot be kept says why in the form.) */
export function describeTextError(error: unknown, action: 'list' | 'delete'): string {
  if (error instanceof UserTextError) return error.message;
  const what = action === 'list' ? 'Your texts could not be read.' : 'The text could not be deleted.';
  if (error instanceof RepositoryError) return `${error.message}${error.retryable ? ' Please try again.' : ''}`;
  return `${what} Please try again.`;
}
