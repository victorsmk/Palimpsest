'use client';

import { useEffect, useState } from 'react';
import type { Passage } from '@/lib/models';
import { bookService } from '@/lib/services';

export type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; passages: Passage[] }
  | { status: 'error'; message: string };

/** The library's passages, loaded through the book service. */
export function useLibrary(): LibraryState {
  const [state, setState] = useState<LibraryState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    bookService
      .listPassages()
      .then(passages => {
        if (!cancelled) setState({ status: 'ready', passages });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', message: 'The library could not be opened. Please reload the page.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
