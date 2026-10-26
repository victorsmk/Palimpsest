'use client';

import { useEffect, useState } from 'react';
import type { PassageLibrary } from '@/lib/library/passageLibrary';
import { bookService } from '@/lib/services';

export type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; library: PassageLibrary }
  | { status: 'error'; message: string };

/** The library: every passage's summary at once, each passage's text when a screen asks for it. */
export function useLibrary(): LibraryState {
  const [state, setState] = useState<LibraryState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    bookService
      .openLibrary()
      .then(library => {
        if (!cancelled) setState({ status: 'ready', library });
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
