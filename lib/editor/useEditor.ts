'use client';

import { useReducer, useEffect, useCallback, useMemo } from 'react';
import type { ErasureStyle, Token } from '@/lib/models';
import type { EditorSnapshot, EditorState } from './types';
import {
  editorReducer,
  createInitialEditorState,
  canUndo as checkCanUndo,
  canRedo as checkCanRedo,
} from './reducer';

export interface UseEditorOptions {
  passageId: string;
  tokens: Token[];
  initialSnapshot?: EditorSnapshot;
}

export function useEditor({ passageId, tokens, initialSnapshot }: UseEditorOptions) {
  const allSelectableIds = useMemo(
    () => tokens.filter(t => t.isSelectable).map(t => t.id),
    [tokens]
  );

  const [state, dispatch] = useReducer(
    editorReducer,
    undefined,
    () => {
      const initial = createInitialEditorState(passageId, allSelectableIds);
      if (initialSnapshot) {
        return {
          ...initial,
          present: initialSnapshot,
        };
      }
      return initial;
    }
  );

  // When passage changes, re-initialize if needed
  useEffect(() => {
    if (state.passageId !== passageId) {
      dispatch({
        type: 'LOAD_SNAPSHOT',
        snapshot: {
          retainedTokenIds: allSelectableIds,
          lineBreaks: [],
          erasureStyle: 'blackout',
          title: '',
        },
        passageId,
      });
    }
  }, [passageId, allSelectableIds, state.passageId]);

  const canUndo = checkCanUndo(state);
  const canRedo = checkCanRedo(state);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const toggleToken = useCallback(
    (tokenId: string) => {
      dispatch({ type: 'TOGGLE_TOKEN', tokenId, allPassageTokenIds: allSelectableIds });
    },
    [allSelectableIds]
  );

  const retainBatch = useCallback(
    (tokenIds: string[]) => {
      dispatch({ type: 'RETAIN_BATCH', tokenIds, allPassageTokenIds: allSelectableIds });
    },
    [allSelectableIds]
  );

  const eraseAll = useCallback(() => {
    dispatch({ type: 'ERASE_ALL' });
  }, []);

  const retainAll = useCallback(() => {
    dispatch({ type: 'RETAIN_ALL', allSelectableTokenIds: allSelectableIds });
  }, [allSelectableIds]);

  const toggleLineBreak = useCallback((tokenId: string) => {
    dispatch({ type: 'TOGGLE_LINE_BREAK', tokenId });
  }, []);

  const setErasureStyle = useCallback((style: ErasureStyle) => {
    dispatch({ type: 'SET_ERASURE_STYLE', style });
  }, []);

  const setTitle = useCallback((title: string) => {
    dispatch({ type: 'SET_TITLE', title });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET', initialSelectableTokenIds: allSelectableIds });
  }, [allSelectableIds]);

  const loadSnapshot = useCallback(
    (snapshot: EditorSnapshot, targetPassageId: string) => {
      dispatch({ type: 'LOAD_SNAPSHOT', snapshot, passageId: targetPassageId });
    },
    []
  );

  // Keyboard shortcut handler for Undo and Redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return; // Do not intercept native text editing

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (!isCmdOrCtrl) return;

      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          // Cmd+Shift+Z or Ctrl+Shift+Z -> Redo
          e.preventDefault();
          if (canRedo) redo();
        } else {
          // Cmd+Z or Ctrl+Z -> Undo
          e.preventDefault();
          if (canUndo) undo();
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        // Ctrl+Y -> Redo on Windows
        e.preventDefault();
        if (canRedo) redo();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  const retainedSet = useMemo(
    () => new Set(state.present.retainedTokenIds),
    [state.present.retainedTokenIds]
  );

  const lineBreakSet = useMemo(
    () => new Set(state.present.lineBreaks),
    [state.present.lineBreaks]
  );

  return {
    state,
    snapshot: state.present,
    retainedSet,
    lineBreakSet,
    retainedCount: state.present.retainedTokenIds.length,
    erasedCount: allSelectableIds.length - state.present.retainedTokenIds.length,
    totalWords: allSelectableIds.length,
    erasureStyle: state.present.erasureStyle,
    title: state.present.title,
    canUndo,
    canRedo,
    undo,
    redo,
    toggleToken,
    retainBatch,
    eraseAll,
    retainAll,
    toggleLineBreak,
    setErasureStyle,
    setTitle,
    reset,
    loadSnapshot,
  };
}
