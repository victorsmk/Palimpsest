'use client';

import { useEffect, useState } from 'react';
import type { Passage } from '@/lib/models';
import type { AssistedSearchResult } from '@/lib/search/assisted';
import { assistedService } from '@/lib/services';

export type AssistedPoemsState =
  | { status: 'loading' }
  | { status: 'ready'; result: AssistedSearchResult }
  | { status: 'unavailable' };

/** Assisted-mode poems for the passage: loading while they are worked out, unavailable if that failed. */
export function useAssistedPoems(passage: Passage): AssistedPoemsState {
  const [result, setResult] = useState<
    { passageId: string; state: Exclude<AssistedPoemsState, { status: 'loading' }> } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    assistedService
      .search(passage)
      .then(found => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'ready', result: found } });
      })
      .catch(() => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'unavailable' } });
      });
    return () => {
      cancelled = true;
    };
  }, [passage]);

  // Until the answer for THIS passage arrives, report loading (never the previous passage's poems).
  return result?.passageId === passage.id ? result.state : { status: 'loading' };
}
