'use client';

import { useReducer, useEffect, useCallback, useMemo } from 'react';
import type { ErasureStyle, Token } from '@/lib/models';
import type { EditorSnapshot } from './types';
import {
  editorReducer,
  createInitialEditorState,
  selectSnapshot,
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

  const defaultSnapshot = useMemo<EditorSnapshot>(
    () => ({
      retainedTokenIds: allSelectableIds,
      lineBreaks: [],
      erasureStyle: 'blackout',
      title: '',
      notes: '',
    }),
    [allSelectableIds]
  );

  // The reducer state follows the passage through an effect, which runs after the
  // render in which the passage changed. Until it does, expose the new passage's
  // defaults so that render never pairs the old selection with the new tokens.
  const { snapshot, isStale } = selectSnapshot(state, passageId, defaultSnapshot);

  useEffect(() => {
    if (isStale) {
      dispatch({ type: 'LOAD_SNAPSHOT', snapshot: defaultSnapshot, passageId });
    }
  }, [isStale, defaultSnapshot, passageId]);

  const canUndo = !isStale && checkCanUndo(state);
  const canRedo = !isStale && checkCanRedo(state);

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

  const setNotes = useCallback((notes: string) => {
    dispatch({ type: 'SET_NOTES', notes });
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
    () => new Set(snapshot.retainedTokenIds),
    [snapshot.retainedTokenIds]
  );

  const lineBreakSet = useMemo(
    () => new Set(snapshot.lineBreaks),
    [snapshot.lineBreaks]
  );

  return {
    state,
    snapshot,
    retainedSet,
    lineBreakSet,
    retainedCount: snapshot.retainedTokenIds.length,
    erasedCount: allSelectableIds.length - snapshot.retainedTokenIds.length,
    totalWords: allSelectableIds.length,
    erasureStyle: snapshot.erasureStyle,
    title: snapshot.title,
    notes: snapshot.notes,
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
    setNotes,
    reset,
    loadSnapshot,
  };
}
