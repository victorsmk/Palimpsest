'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Passage } from '@/lib/models';
import { PASSAGE_UNAVAILABLE_MESSAGE, type PassageLibrary } from '@/lib/library/passageLibrary';

export { PASSAGE_UNAVAILABLE_MESSAGE };

export interface PassageChoice {
  /** The passage the reader chose last; the selector shows this one as pressed straight away. */
  chosenId: string;
  /** The passage on screen: the chosen one once it has loaded (the one before it, until then). Null while the first loads. */
  passage: Passage | null;
  /** Set when the chosen passage could not be loaded; the page keeps showing the one before. */
  error: string | null;
  choose(id: string): void;
}

/**
 * Which passage a page that shows one at a time (Discover, Assisted) is on. Choosing a passage
 * loads it first, so the page never shows a passage whose text is not there. A choice made before
 * the last one arrived is dropped when the last one does. With `initialId` null nothing is open
 * until `choose` is called.
 */
export function usePassageChoice(library: PassageLibrary, initialId: string | null): PassageChoice {
  // With no initial passage nothing has been chosen yet: the page asks the reader to choose one.
  const [chosenId, setChosenId] = useState(initialId ?? '');
  const [passage, setPassage] = useState<Passage | null>(() => (initialId ? (library.get(initialId) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(
    (id: string) => {
      const mine = ++latest.current;
      library
        .ensure([id])
        .then(([loaded]) => {
          if (mine !== latest.current) return;
          if (loaded) {
            setPassage(loaded);
            setError(null);
          } else {
            setError(PASSAGE_UNAVAILABLE_MESSAGE);
          }
        })
        .catch(() => {
          if (mine === latest.current) setError(PASSAGE_UNAVAILABLE_MESSAGE);
        });
    },
    [library]
  );

  useEffect(() => {
    if (initialId && !library.get(initialId)) load(initialId);
  }, [library, initialId, load]);

  const choose = useCallback(
    (id: string) => {
      setChosenId(id);
      setError(null);
      load(id);
    },
    [load]
  );

  return { chosenId, passage, error, choose };
}
