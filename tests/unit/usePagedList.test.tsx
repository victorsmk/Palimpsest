// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import type { Page } from '@/lib/models';
import { usePagedList } from '@/components/usePagedList';
import { renderHook } from '../helpers/react';

// A list read a page at a time from a server that can be slow or fail: only the answer to the latest question is
// shown, typing waits before asking, and a failed page can be tried again.

afterEach(() => vi.useRealTimers());

const pageOf = (items: string[], next: string | null = null): Page<string> => ({ items, next });

/** A promise whose answer the test gives later. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

describe('reading a list a page at a time', () => {
  it('loads the first page, and says it is loading until then', async () => {
    const load = vi.fn(async () => pageOf(['a', 'b'], 'cursor'));
    const { result } = renderHook(({ key }) => usePagedList(key, load), { key: 'k' });
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    await settle();
    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(true);
    expect(load).toHaveBeenCalledWith();
  });

  it('adds the next page when asked, with the cursor of the page before', async () => {
    const load = vi.fn(async (after?: string) => (after === undefined ? pageOf(['a'], 'c1') : after === 'c1' ? pageOf(['b'], 'c2') : pageOf(['c'])));
    const { result } = renderHook(({ key }) => usePagedList(key, load), { key: 'k' });
    await settle();
    act(() => result.current.loadMore());
    await settle();
    act(() => result.current.loadMore());
    await settle();
    expect(result.current.items).toEqual(['a', 'b', 'c']);
    expect(result.current.hasMore).toBe(false);
    expect(load.mock.calls.map(c => c[0])).toEqual([undefined, 'c1', 'c2']);
  });

  it('asks for a page only once at a time', async () => {
    const second = deferred<Page<string>>();
    const load = vi.fn((after?: string) => (after === undefined ? Promise.resolve(pageOf(['a'], 'c1')) : second.promise));
    const { result } = renderHook(({ key }) => usePagedList(key, load), { key: 'k' });
    await settle();
    act(() => result.current.loadMore());
    act(() => result.current.loadMore());
    act(() => result.current.loadMore());
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.more).toBe('loading');
    second.resolve(pageOf(['b']));
    await settle();
    expect(result.current.items).toEqual(['a', 'b']);
  });

  it('shows only the answer to the latest question, however late an earlier one arrives', async () => {
    const slow = deferred<Page<string>>();
    const load = vi.fn((key: string) => (key === 'old' ? slow.promise : Promise.resolve(pageOf(['new answer']))));
    const { result, rerender } = renderHook(({ key }) => usePagedList(key, () => load(key)), { key: 'old' });
    await settle(); // the first question is asked, and waits for its answer
    expect(load).toHaveBeenCalledWith('old');
    rerender({ key: 'new' });
    await settle();
    expect(result.current.items).toEqual(['new answer']);
    slow.resolve(pageOf(['old answer']));
    await settle();
    expect(result.current.items).toEqual(['new answer']);
  });

  it('keeps the last items on screen while the next question is on its way, and says it is loading', async () => {
    const next = deferred<Page<string>>();
    const load = vi.fn((key: string) => (key === 'one' ? Promise.resolve(pageOf(['first'])) : next.promise));
    const { result, rerender } = renderHook(({ key }) => usePagedList(key, () => load(key)), { key: 'one' });
    await settle();
    rerender({ key: 'two' });
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual(['first']);
    expect(result.current.hasMore).toBe(false);
    next.resolve(pageOf(['second']));
    await settle();
    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual(['second']);
  });

  it('waits before asking when the key changes, so that typing does not ask for every letter', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => pageOf(['x']));
    const { rerender } = renderHook(({ key }) => usePagedList(key, load, 250), { key: '' });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(load).toHaveBeenCalledTimes(1);
    for (const key of ['d', 'do', 'dor', 'dori']) {
      rerender({ key });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(load).toHaveBeenCalledTimes(1); // still waiting: each letter came before the pause was over
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('says the first page failed, shows no more to load, and asks again when told to retry', async () => {
    let fail = true;
    const load = vi.fn(async () => (fail ? Promise.reject(new Error('down')) : pageOf(['ok'])));
    const { result } = renderHook(({ key }) => usePagedList(key, load), { key: 'k' });
    await settle();
    expect(result.current.failed).toBe(true);
    expect(result.current.hasMore).toBe(false);
    fail = false;
    act(() => result.current.retry());
    expect(result.current.failed).toBe(false);
    expect(result.current.loading).toBe(true);
    await settle();
    expect(result.current.items).toEqual(['ok']);
    expect(result.current.failed).toBe(false);
  });

  it('keeps the items it has, and says so, when a later page fails; and tries that page again', async () => {
    let fail = true;
    const load = vi.fn(async (after?: string) => (after === undefined ? pageOf(['a'], 'c1') : fail ? Promise.reject(new Error('down')) : pageOf(['b'])));
    const { result } = renderHook(({ key }) => usePagedList(key, load), { key: 'k' });
    await settle();
    act(() => result.current.loadMore());
    await settle();
    expect(result.current.more).toBe('failed');
    expect(result.current.items).toEqual(['a']);
    expect(result.current.hasMore).toBe(true);
    fail = false;
    act(() => result.current.loadMore());
    await settle();
    expect(result.current.items).toEqual(['a', 'b']);
  });

  it('drops the answer to a request for more if the key changed meanwhile', async () => {
    const more = deferred<Page<string>>();
    const load = vi.fn((key: string, after?: string) => (after === 'c1' ? more.promise : Promise.resolve(pageOf([key], key === 'one' ? 'c1' : null))));
    const { result, rerender } = renderHook(({ key }) => usePagedList(key, after => load(key, after)), { key: 'one' });
    await settle();
    act(() => result.current.loadMore());
    rerender({ key: 'two' });
    await settle();
    more.resolve(pageOf(['stale']));
    await settle();
    expect(result.current.items).toEqual(['two']);
  });
});
