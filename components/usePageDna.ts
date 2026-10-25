'use client';

import { useEffect, useState } from 'react';
import type { Passage } from '@/lib/models';
import { pageDnaService } from '@/lib/services';

/** Page DNA for the passage, or null while it is being computed (or if that failed). */
export function usePageDna(passage: Passage): number | null {
  const [result, setResult] = useState<{ passageId: string; value: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    pageDnaService
      .getPageDNA(passage)
      .then(value => {
        if (!cancelled) setResult({ passageId: passage.id, value });
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [passage]);

  return result?.passageId === passage.id ? result.value : null;
}
