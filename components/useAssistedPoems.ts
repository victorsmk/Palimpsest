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

export type UncertainPoemsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: AssistedSearchResult }
  | { status: 'unavailable' };

/**
 * The Assisted poems that depend on how a word is said. Nothing is searched until `asked` is true,
 * so a reader who never asks pays nothing for them.
 */
export function useUncertainAssistedPoems(passage: Passage, asked: boolean): UncertainPoemsState {
  const [result, setResult] = useState<
    { passageId: string; state: Exclude<UncertainPoemsState, { status: 'idle' | 'loading' }> } | null
  >(null);

  useEffect(() => {
    if (!asked) return;
    let cancelled = false;
    assistedService
      .searchUncertain(passage)
      .then(found => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'ready', result: found } });
      })
      .catch(() => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'unavailable' } });
      });
    return () => {
      cancelled = true;
    };
  }, [passage, asked]);

  if (!asked) return { status: 'idle' };
  return result?.passageId === passage.id ? result.state : { status: 'loading' };
}
