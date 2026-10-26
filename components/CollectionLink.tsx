'use client';

import { useRouter } from 'next/navigation';
import { savedPoemHref } from '@/lib/handoff';
import { MyCollectionButton } from './MyCollectionButton';
import type { PassageLibrary } from '@/lib/library/passageLibrary';
import { useLibrary } from './useLibrary';

/**
 * My Collection for pages that have no editor of their own (the home page): choosing a poem goes to
 * the Studio with it open. It loads the library itself, and until then shows the button, unusable.
 */
export function CollectionLink() {
  const state = useLibrary();
  return <CollectionForPage library={state.status === 'ready' ? state.library : null} />;
}

/** The same, for a page that already holds the library's passages (Discover, Assisted). */
export function CollectionForPage({ library }: { library: PassageLibrary | null }) {
  const router = useRouter();
  return <MyCollectionButton library={library} onOpenPoem={poem => router.push(savedPoemHref(poem.id))} />;
}
