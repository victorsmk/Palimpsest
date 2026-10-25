'use client';

import type { Passage } from '@/lib/models';
import type { PageDna } from '@/lib/search/found';
import { useFoundAnalysis } from './useFoundAnalysis';

export type PageDnaState =
  | { status: 'loading' }
  | { status: 'ready'; pageDna: PageDna }
  | { status: 'unavailable' };

/** Page DNA for the passage: loading while it is worked out, unavailable if that failed. */
export function usePageDna(passage: Passage): PageDnaState {
  const state = useFoundAnalysis(passage);
  return state.status === 'ready' ? { status: 'ready', pageDna: state.analysis.pageDna } : state;
}
