'use client';

import { useEffect, useState } from 'react';
import type { Passage } from '@/lib/models';
import type { PageDna } from '@/lib/search/found';
import { pageDnaService } from '@/lib/services';

export type PageDnaState =
  | { status: 'loading' }
  | { status: 'ready'; pageDna: PageDna }
  | { status: 'unavailable' };

/** Page DNA for the passage: loading while it is worked out, unavailable if that failed. */
export function usePageDna(passage: Passage): PageDnaState {
  const [result, setResult] = useState<
    { passageId: string; state: Exclude<PageDnaState, { status: 'loading' }> } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    pageDnaService
      .getPageDna(passage)
      .then(pageDna => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'ready', pageDna } });
      })
      .catch(() => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'unavailable' } });
      });
    return () => {
      cancelled = true;
    };
  }, [passage]);

  // Until the answer for THIS passage arrives, show loading (never the previous passage's strip).
  return result?.passageId === passage.id ? result.state : { status: 'loading' };
}
