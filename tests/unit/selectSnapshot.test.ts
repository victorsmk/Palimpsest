import { describe, it, expect } from 'vitest';
import { createInitialEditorState, editorReducer, selectSnapshot } from '@/lib/editor';
import type { EditorSnapshot } from '@/lib/editor';

const idsA = ['a-token-0000', 'a-token-0001', 'a-token-0002'];
const idsB = ['b-token-0000', 'b-token-0001'];

const defaultsB: EditorSnapshot = {
  retainedTokenIds: idsB,
  lineBreaks: [],
  erasureStyle: 'blackout',
  title: '',
  notes: '',
};

describe('selectSnapshot (passage switching)', () => {
  it('returns the editor selection while the state belongs to the current passage', () => {
    let state = createInitialEditorState('a', idsA);
    state = editorReducer(state, { type: 'TOGGLE_TOKEN', tokenId: idsA[1], allPassageTokenIds: idsA });

    const { snapshot, isStale } = selectSnapshot(state, 'a', defaultsB);
    expect(isStale).toBe(false);
    expect(snapshot.retainedTokenIds).toEqual([idsA[0], idsA[2]]);
  });

  it('returns the new passage defaults, never the old selection, while the state is stale', () => {
    let state = createInitialEditorState('a', idsA);
    state = editorReducer(state, { type: 'TOGGLE_TOKEN', tokenId: idsA[1], allPassageTokenIds: idsA });

    const { snapshot, isStale } = selectSnapshot(state, 'b', defaultsB);
    expect(isStale).toBe(true);
    expect(snapshot).toBe(defaultsB);
    expect(snapshot.retainedTokenIds.every(id => id.startsWith('b-'))).toBe(true);
  });

  it('stops being stale once the snapshot is loaded for the new passage', () => {
    const state = editorReducer(createInitialEditorState('a', idsA), {
      type: 'LOAD_SNAPSHOT',
      snapshot: { ...defaultsB, erasureStyle: 'faded' },
      passageId: 'b',
    });

    const { snapshot, isStale } = selectSnapshot(state, 'b', defaultsB);
    expect(isStale).toBe(false);
    expect(snapshot.erasureStyle).toBe('faded');
    expect(state.past).toEqual([]);
  });
});
