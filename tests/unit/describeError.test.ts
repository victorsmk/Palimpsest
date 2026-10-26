import { describe, it, expect } from 'vitest';
import { BrowserPoemRepository, MemoryStorageAdapter } from '@/lib/repositories';
import {
  OfflineError,
  PoemConflictError,
  PoemGoneError,
  PoemLimitError,
  RateLimitedError,
  RepositoryError,
  StorageError,
  UnauthorizedError,
  UnavailableError,
  storageFailureOf,
  type Poem,
} from '@/lib/models';
import { describeError, POEM_MISSING_MESSAGE, type Action } from '@/lib/errors/describe';

const aPoem = { id: 'x' } as Poem;
const ACTIONS: Action[] = ['save', 'rename', 'duplicate', 'delete', 'backup', 'restore', 'open', 'list'];

describe('the errors a repository reports', () => {
  it('are all RepositoryErrors with their own code, and say whether trying again could help', () => {
    const table: [RepositoryError, string, boolean][] = [
      [new PoemLimitError('Too long, sorry.'), 'limit', false],
      [new PoemConflictError(aPoem), 'conflict', false],
      [new PoemGoneError(), 'gone', false],
      [new StorageError('full'), 'storage', false],
      [new StorageError('blocked'), 'storage', false],
      [new StorageError('other'), 'storage', true],
      [new OfflineError(), 'offline', true],
      [new UnauthorizedError(), 'unauthorized', false],
      [new RateLimitedError(), 'rate-limited', false],
      [new UnavailableError(), 'unavailable', true],
    ];
    for (const [error, code, retryable] of table) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RepositoryError);
      expect([error.code, error.retryable]).toEqual([code, retryable]);
      expect(error.message.length).toBeGreaterThan(10);
    }
  });

  it('keep the cause they were made from', () => {
    const cause = new DOMException('full', 'QuotaExceededError');
    expect(new StorageError('full', { cause }).cause).toBe(cause);
    expect(new OfflineError({ cause }).cause).toBe(cause);
  });
});

describe('what a failed storage write means', () => {
  it.each([
    [new DOMException('full', 'QuotaExceededError'), 'full'],
    [Object.assign(new Error('x'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }), 'full'],
    [{ code: 22 }, 'full'],
    [{ code: 1014 }, 'full'],
    [new DOMException('no', 'SecurityError'), 'blocked'],
    [new DOMException('no', 'NotAllowedError'), 'blocked'],
    [new Error('something else'), 'other'],
    [null, 'other'],
    ['text', 'other'],
  ])('%j is %s', (cause, expected) => {
    expect(storageFailureOf(cause)).toBe(expected);
  });

  const failing = (error: unknown) =>
    new BrowserPoemRepository({
      getItem: () => null,
      setItem: () => {
        throw error;
      },
      removeItem: () => {},
    });
  const draft = { passageId: 'p', retainedTokenIds: ['t'], lineBreaks: [], erasureStyle: 'blackout' as const };

  it('is reported by the browser repository as a StorageError of that kind, with the original error attached', async () => {
    for (const [error, failure] of [
      [new DOMException('full', 'QuotaExceededError'), 'full'],
      [new DOMException('no', 'SecurityError'), 'blocked'],
      [new Error('odd'), 'other'],
    ] as const) {
      const caught = (await failing(error).create(draft).catch(e => e)) as StorageError;
      expect(caught).toBeInstanceOf(StorageError);
      expect(caught.failure).toBe(failure);
      expect(caught.cause).toBe(error);
    }
  });

  it('leaves nothing stored when the write fails', async () => {
    const storage = new MemoryStorageAdapter();
    const repo = new BrowserPoemRepository(storage);
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    await expect(repo.create(draft)).rejects.toBeInstanceOf(StorageError);
    expect((await repo.list()).items).toEqual([]);
  });
});

describe('describeError', () => {
  it('says what a repository error says, in its own words', () => {
    expect(describeError(new PoemLimitError('Notes can be up to 10,000 characters.'), 'save')).toBe('Notes can be up to 10,000 characters.');
    expect(describeError(new PoemConflictError(aPoem), 'save')).toMatch(/^This poem was changed somewhere else/);
    expect(describeError(new PoemGoneError(), 'save')).toMatch(/^This poem was deleted somewhere else/);
    expect(describeError(new StorageError('full'), 'save')).toBe('Your browser has no room left to store this. Delete some poems, or back up and clear space, then try again.');
    expect(describeError(new StorageError('blocked'), 'save')).toBe('Your browser is not letting this site store anything, for example in a private window. Your poem has not been saved.');
    expect(describeError(new UnauthorizedError(), 'save')).toBe('You need to sign in to do this.');
    expect(describeError(new RateLimitedError(), 'save')).toBe('Too many requests just now. Wait a moment, then try again.');
  });

  it('adds "Please try again." only where trying again could help', () => {
    expect(describeError(new OfflineError(), 'save')).toBe('You appear to be offline. Check your connection. Please try again.');
    expect(describeError(new UnavailableError(), 'rename')).toBe('The server could not be reached. Please try again.');
    expect(describeError(new StorageError('other'), 'save')).toBe('Your browser could not store this, so nothing was saved. Please try again.');
    for (const error of [new StorageError('full'), new StorageError('blocked'), new PoemLimitError('x.'), new PoemConflictError(aPoem), new PoemGoneError(), new UnauthorizedError(), new RateLimitedError()]) {
      expect(describeError(error, 'save')).not.toMatch(/Please try again\./);
    }
  });

  it('says a poem that was chosen from a list or link and has gone is simply not in the collection', () => {
    for (const action of ['rename', 'duplicate', 'open'] as const) expect(describeError(new PoemGoneError(), action)).toBe(POEM_MISSING_MESSAGE);
    expect(describeError(new PoemGoneError(), 'save')).toMatch(/deleted somewhere else/);
  });

  it('says a restore changed nothing, whatever went wrong with it', () => {
    expect(describeError(new PoemLimitError('Your collection is full.'), 'restore')).toBe('Your collection is full. Your collection has not been changed.');
    expect(describeError(new StorageError('full'), 'restore')).toMatch(/then try again\. Your collection has not been changed\.$/);
    expect(describeError(new Error('?'), 'restore')).toBe('The poems could not be added, and your collection has not been changed. Please try again.');
  });

  it('gives anything it does not know a plain sentence about what was being done, never the error text itself', () => {
    const odd = new Error('TypeError: x is not a function at foo.js:12');
    const said = ACTIONS.map(action => describeError(odd, action));
    for (const text of said) expect(text).not.toMatch(/TypeError|foo\.js/);
    expect(said).toEqual([
      'Could not save the draft.',
      'Could not rename this poem. Please try again.',
      'Could not duplicate this poem. Please try again.',
      'This poem could not be deleted. Please try again.',
      'Could not create the backup. Please try again.',
      'The poems could not be added, and your collection has not been changed. Please try again.',
      'Your collection could not be read. Please try again.',
      'Your collection could not be read. Please try again.',
    ]);
    expect(describeError('text', 'save')).toBe('Could not save the draft.');
    expect(describeError(undefined, 'delete')).toBe('This poem could not be deleted. Please try again.');
  });
});
