import type { Token } from '@/lib/models';
import type { EditorSnapshot } from './types';

/** What a passage looks like before anything is done to it: every word kept, no breaks, blackout. */
export function createDefaultSnapshot(tokens: readonly Token[]): EditorSnapshot {
  return {
    retainedTokenIds: tokens.filter(t => t.isSelectable).map(t => t.id),
    lineBreaks: [],
    erasureStyle: 'blackout',
    title: '',
    notes: '',
  };
}

const sameMembers = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const members = new Set(a);
  return members.size === new Set(b).size && b.every(id => members.has(id));
};

/**
 * Whether two snapshots are the same poem: the same kept words, line breaks, style, title and notes.
 * It compares what the snapshots hold, not how the writer got there, so undoing back to where they
 * started leaves them equal.
 */
export function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  return (
    a.erasureStyle === b.erasureStyle &&
    a.title === b.title &&
    a.notes === b.notes &&
    sameMembers(a.retainedTokenIds, b.retainedTokenIds) &&
    sameMembers(a.lineBreaks, b.lineBreaks)
  );
}
