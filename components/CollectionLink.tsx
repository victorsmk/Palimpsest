'use client';

import { useRouter } from 'next/navigation';
import { savedPoemHref } from '@/lib/handoff';
import { MyCollectionButton } from './MyCollectionButton';
import { useLibrary } from './useLibrary';

/**
 * My Collection for pages that have no editor of their own (the home page): choosing a poem goes to
 * the Studio with it open. It loads the library itself, and until then shows the button, unusable.
 */
export function CollectionLink() {
  const library = useLibrary();
  return <CollectionForPage passages={library.status === 'ready' ? library.passages : []} ready={library.status === 'ready'} />;
}

/** The same, for a page that already holds the library's passages (Discover, Assisted). */
export function CollectionForPage({ passages, ready = true }: { passages: Parameters<typeof MyCollectionButton>[0]['passages']; ready?: boolean }) {
  const router = useRouter();
  return <MyCollectionButton passages={passages} ready={ready} onOpenPoem={poem => router.push(savedPoemHref(poem.id))} />;
}
