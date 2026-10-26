'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '@/lib/models';

interface PagedState<T> {
  /** The key and attempt the items belong to; when either differs from the current one, a fresh first page is on its way. */
  key: string;
  attempt: number;
  items: T[];
  next: string | null;
  failed: boolean;
  more: 'idle' | 'loading' | 'failed';
}

export interface PagedList<T> {
  /** The items so far. While a new first page loads these are still the last ones, so that a list does not blink away as someone types. */
  items: T[];
  /** Whether the first page for the current key is still on its way. */
  loading: boolean;
  /** Whether the first page for the current key failed. */
  failed: boolean;
  hasMore: boolean;
  more: 'idle' | 'loading' | 'failed';
  loadMore(): void;
  retry(): void;
}

/**
 * A list read a page at a time from somewhere that can be slow or fail (the server's library). Whenever
 * `key` changes the first page is fetched again after `delayMs` (so that typing does not send a request for
 * every letter); an answer for a key that is no longer the current one is dropped, so a slow answer can
 * never replace a newer one.
 */
export function usePagedList<T>(key: string, load: (after?: string) => Promise<Page<T>>, delayMs = 0): PagedList<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PagedState<T>>({ key: '', attempt: -1, items: [], next: null, failed: false, more: 'idle' });
  const latest = useRef(0);

  useEffect(() => {
    const mine = ++latest.current;
    const timer = setTimeout(() => {
      loadRef.current().then(
        page => {
          if (mine === latest.current) setState({ key, attempt, items: page.items, next: page.next, failed: false, more: 'idle' });
        },
        () => {
          if (mine === latest.current) setState(previous => ({ ...previous, key, attempt, failed: true, next: null, more: 'idle' }));
        }
      );
    }, delayMs);
    return () => clearTimeout(timer);
  }, [key, attempt, delayMs]);

  const current = state.key === key && state.attempt === attempt;
  const loadMore = useCallback(() => {
    if (!current || state.next === null || state.more === 'loading') return;
    const mine = latest.current;
    setState(previous => ({ ...previous, more: 'loading' }));
    loadRef.current(state.next).then(
      page => {
        if (mine === latest.current) setState(previous => ({ ...previous, items: [...previous.items, ...page.items], next: page.next, more: 'idle' }));
      },
      () => {
        if (mine === latest.current) setState(previous => ({ ...previous, more: 'failed' }));
      }
    );
  }, [current, state.next, state.more]);

  return {
    items: state.items,
    loading: !current,
    failed: current && state.failed,
    hasMore: current && state.next !== null,
    more: current ? state.more : 'idle',
    loadMore,
    retry: () => setAttempt(n => n + 1),
  };
}
