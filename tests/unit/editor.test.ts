import { describe, it, expect } from 'vitest';
import {
  createInitialEditorState,
  editorReducer,
  canUndo,
  canRedo,
  MAX_HISTORY_LENGTH,
} from '@/lib/editor';

describe('Editor State & History Engine', () => {
  const allTokens = ['t-1', 't-2', 't-3', 't-4', 't-5'];

  it('initializes with all tokens retained and empty history', () => {
    const state = createInitialEditorState('passage-1', allTokens);

    expect(state.passageId).toBe('passage-1');
    expect(state.present.retainedTokenIds).toEqual(allTokens);
    expect(state.present.lineBreaks).toEqual([]);
    expect(state.present.erasureStyle).toBe('blackout');
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it('toggles tokens preserving source order and updates history', () => {
    let state = createInitialEditorState('passage-1', allTokens);

    // Erase t-2
    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-2',
      allPassageTokenIds: allTokens,
    });

    expect(state.present.retainedTokenIds).toEqual(['t-1', 't-3', 't-4', 't-5']);
    expect(canUndo(state)).toBe(true);
    expect(state.past).toHaveLength(1);

    // Restore t-2 -> should be placed in original source position, not at the end
    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-2',
      allPassageTokenIds: allTokens,
    });

    expect(state.present.retainedTokenIds).toEqual(['t-1', 't-2', 't-3', 't-4', 't-5']);
    expect(state.past).toHaveLength(2);
  });

  it('supports undo and redo cleanly', () => {
    let state = createInitialEditorState('passage-1', allTokens);

    // Action 1: toggle t-1
    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-1',
      allPassageTokenIds: allTokens,
    });
    expect(state.present.retainedTokenIds).toEqual(['t-2', 't-3', 't-4', 't-5']);

    // Action 2: toggle t-5
    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-5',
      allPassageTokenIds: allTokens,
    });
    expect(state.present.retainedTokenIds).toEqual(['t-2', 't-3', 't-4']);

    // Undo Action 2
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.present.retainedTokenIds).toEqual(['t-2', 't-3', 't-4', 't-5']);
    expect(canRedo(state)).toBe(true);

    // Undo Action 1
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.present.retainedTokenIds).toEqual(allTokens);
    expect(canUndo(state)).toBe(false);

    // Redo Action 1
    state = editorReducer(state, { type: 'REDO' });
    expect(state.present.retainedTokenIds).toEqual(['t-2', 't-3', 't-4', 't-5']);

    // Redo Action 2
    state = editorReducer(state, { type: 'REDO' });
    expect(state.present.retainedTokenIds).toEqual(['t-2', 't-3', 't-4']);
    expect(canRedo(state)).toBe(false);
  });

  it('clears future redo stack when a new action is performed after undo', () => {
    let state = createInitialEditorState('passage-1', allTokens);

    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-1',
      allPassageTokenIds: allTokens,
    });

    state = editorReducer(state, { type: 'UNDO' });
    expect(canRedo(state)).toBe(true);

    // Perform a different action
    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-3',
      allPassageTokenIds: allTokens,
    });

    expect(canRedo(state)).toBe(false);
    expect(state.future).toHaveLength(0);
  });

  it('manages editable line breaks on retained tokens', () => {
    let state = createInitialEditorState('passage-1', allTokens);

    // Add line break after t-2
    state = editorReducer(state, { type: 'TOGGLE_LINE_BREAK', tokenId: 't-2' });
    expect(state.present.lineBreaks).toEqual(['t-2']);

    // Remove line break after t-2
    state = editorReducer(state, { type: 'TOGGLE_LINE_BREAK', tokenId: 't-2' });
    expect(state.present.lineBreaks).toEqual([]);

    // Line break cannot be added to an un-retained token
    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-4',
      allPassageTokenIds: allTokens,
    });
    state = editorReducer(state, { type: 'TOGGLE_LINE_BREAK', tokenId: 't-4' });
    expect(state.present.lineBreaks).toEqual([]);

    // If a token with a line break is erased, its line break is cleaned up
    state = editorReducer(state, { type: 'TOGGLE_LINE_BREAK', tokenId: 't-3' });
    expect(state.present.lineBreaks).toEqual(['t-3']);

    state = editorReducer(state, {
      type: 'TOGGLE_TOKEN',
      tokenId: 't-3',
      allPassageTokenIds: allTokens,
    });
    expect(state.present.lineBreaks).toEqual([]);
  });

  it('handles ERASE_ALL, RETAIN_ALL, and RESET', () => {
    let state = createInitialEditorState('passage-1', allTokens);

    state = editorReducer(state, { type: 'ERASE_ALL' });
    expect(state.present.retainedTokenIds).toEqual([]);

    state = editorReducer(state, {
      type: 'RETAIN_ALL',
      allSelectableTokenIds: allTokens,
    });
    expect(state.present.retainedTokenIds).toEqual(allTokens);

    state = editorReducer(state, {
      type: 'RESET',
      initialSelectableTokenIds: allTokens,
    });
    expect(state.present.retainedTokenIds).toEqual(allTokens);
    expect(state.present.lineBreaks).toEqual([]);
    expect(state.present.erasureStyle).toBe('blackout');
  });

  it('caps history stack at MAX_HISTORY_LENGTH', () => {
    let state = createInitialEditorState('passage-1', allTokens);

    // Perform 60 undoable actions
    for (let i = 0; i < 60; i++) {
      state = editorReducer(state, {
        type: 'SET_ERASURE_STYLE',
        style: i % 2 === 0 ? 'faded' : 'whiteout',
      });
    }

    expect(state.past.length).toBe(MAX_HISTORY_LENGTH);
    expect(state.present.erasureStyle).toBe('whiteout');
  });

  describe('title and notes metadata', () => {
    it('start empty and are set without adding history', () => {
      let state = createInitialEditorState('passage-1', allTokens);
      expect(state.present.title).toBe('');
      expect(state.present.notes).toBe('');

      state = editorReducer(state, { type: 'SET_TITLE', title: 'Winter' });
      state = editorReducer(state, { type: 'SET_NOTES', notes: 'First pass' });

      expect(state.present.title).toBe('Winter');
      expect(state.present.notes).toBe('First pass');
      expect(state.past).toEqual([]);
      expect(canUndo(state)).toBe(false);
    });

    it('are never reverted or re-applied by undo and redo', () => {
      let state = createInitialEditorState('passage-1', allTokens);
      state = editorReducer(state, { type: 'ERASE_ALL' });
      state = editorReducer(state, { type: 'SET_TITLE', title: 'Winter' });
      state = editorReducer(state, { type: 'SET_NOTES', notes: 'First pass' });
      state = editorReducer(state, { type: 'RETAIN_ALL', allSelectableTokenIds: allTokens });

      state = editorReducer(state, { type: 'UNDO' });
      expect(state.present.retainedTokenIds).toEqual([]);
      expect(state.present.title).toBe('Winter');
      expect(state.present.notes).toBe('First pass');

      state = editorReducer(state, { type: 'UNDO' });
      expect(state.present.retainedTokenIds).toEqual(allTokens);
      expect(state.present.title).toBe('Winter');

      state = editorReducer(state, { type: 'REDO' });
      state = editorReducer(state, { type: 'REDO' });
      expect(state.present.retainedTokenIds).toEqual(allTokens);
      expect(state.present.title).toBe('Winter');
      expect(state.present.notes).toBe('First pass');
    });

    it('return the same state object when nothing changes', () => {
      let state = createInitialEditorState('passage-1', allTokens);
      state = editorReducer(state, { type: 'SET_TITLE', title: 'Winter' });
      expect(editorReducer(state, { type: 'SET_TITLE', title: 'Winter' })).toBe(state);
      expect(editorReducer(state, { type: 'SET_NOTES', notes: '' })).toBe(state);
    });

    it('survive RESET, which restores words and style only', () => {
      let state = createInitialEditorState('passage-1', allTokens);
      state = editorReducer(state, { type: 'SET_TITLE', title: 'Winter' });
      state = editorReducer(state, { type: 'SET_NOTES', notes: 'First pass' });
      state = editorReducer(state, { type: 'SET_ERASURE_STYLE', style: 'faded' });
      state = editorReducer(state, { type: 'ERASE_ALL' });

      state = editorReducer(state, { type: 'RESET', initialSelectableTokenIds: allTokens });

      expect(state.present.retainedTokenIds).toEqual(allTokens);
      expect(state.present.erasureStyle).toBe('blackout');
      expect(state.present.title).toBe('Winter');
      expect(state.present.notes).toBe('First pass');
    });
  });

  it('tracks erasure style changes with undo and redo', () => {
    let state = createInitialEditorState('passage-1', allTokens);
    expect(state.present.erasureStyle).toBe('blackout');

    // Switch to faded
    state = editorReducer(state, { type: 'SET_ERASURE_STYLE', style: 'faded' });
    expect(state.present.erasureStyle).toBe('faded');
    expect(canUndo(state)).toBe(true);

    // Switch to whiteout
    state = editorReducer(state, { type: 'SET_ERASURE_STYLE', style: 'whiteout' });
    expect(state.present.erasureStyle).toBe('whiteout');

    // Undo to faded
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.present.erasureStyle).toBe('faded');

    // Undo to blackout
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.present.erasureStyle).toBe('blackout');

    // Redo to faded
    state = editorReducer(state, { type: 'REDO' });
    expect(state.present.erasureStyle).toBe('faded');
  });
});
