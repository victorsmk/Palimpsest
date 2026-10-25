'use client';

import { useEffect, useState } from 'react';
import type { Passage } from '@/lib/models';
import type { FoundAnalysis } from '@/lib/search/found';
import { foundService } from '@/lib/services';

export type FoundAnalysisState =
  | { status: 'loading' }
  | { status: 'ready'; analysis: FoundAnalysis }
  | { status: 'unavailable' };

/** Found-mode results for the passage: loading while they are worked out, unavailable if that failed. */
export function useFoundAnalysis(passage: Passage): FoundAnalysisState {
  const [result, setResult] = useState<
    { passageId: string; state: Exclude<FoundAnalysisState, { status: 'loading' }> } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    foundService
      .analyze(passage)
      .then(analysis => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'ready', analysis } });
      })
      .catch(() => {
        if (!cancelled) setResult({ passageId: passage.id, state: { status: 'unavailable' } });
      });
    return () => {
      cancelled = true;
    };
  }, [passage]);

  // Until the answer for THIS passage arrives, report loading (never the previous passage's results).
  return result?.passageId === passage.id ? result.state : { status: 'loading' };
}
