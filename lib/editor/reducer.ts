import type { EditorAction, EditorSnapshot, EditorState } from './types';

export const MAX_HISTORY_LENGTH = 50;

/**
 * Creates a fresh editor state initialized with all selectable tokens retained by default.
 */
export function createInitialEditorState(
  passageId: string,
  initialSelectableTokenIds: string[] = []
): EditorState {
  const present: EditorSnapshot = {
    retainedTokenIds: [...initialSelectableTokenIds],
    lineBreaks: [],
    erasureStyle: 'blackout',
    title: '',
    notes: '',
  };

  return {
    past: [],
    present,
    future: [],
    passageId,
  };
}

/**
 * Helper to record a new state into history, capping past states at MAX_HISTORY_LENGTH.
 */
function pushHistory(state: EditorState, nextPresent: EditorSnapshot): EditorState {
  const newPast = [...state.past, state.present];
  if (newPast.length > MAX_HISTORY_LENGTH) {
    newPast.shift();
  }

  return {
    ...state,
    past: newPast,
    present: nextPresent,
    future: [], // New user action clears redo branch
  };
}

/**
 * Title and notes are poem metadata, not composition: changing them adds no
 * history entry, and undo/redo never reverts them. They are applied to every
 * snapshot so that stepping through history leaves them as they are.
 */
function setMetadata(
  state: EditorState,
  patch: Partial<Pick<EditorSnapshot, 'title' | 'notes'>>
): EditorState {
  const unchanged = (Object.keys(patch) as (keyof typeof patch)[]).every(
    key => state.present[key] === patch[key]
  );
  if (unchanged) return state;

  const apply = (snapshot: EditorSnapshot): EditorSnapshot => ({ ...snapshot, ...patch });
  return {
    ...state,
    past: state.past.map(apply),
    present: apply(state.present),
    future: state.future.map(apply),
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'TOGGLE_TOKEN': {
      const isRetained = state.present.retainedTokenIds.includes(action.tokenId);
      let nextRetained: string[];

      if (isRetained) {
        nextRetained = state.present.retainedTokenIds.filter(id => id !== action.tokenId);
      } else {
        // Maintain tokens in original source order
        const set = new Set([...state.present.retainedTokenIds, action.tokenId]);
        nextRetained = action.allPassageTokenIds.filter(id => set.has(id));
      }

      // If token is erased, clean up any line break associated with it
      const nextLineBreaks = isRetained
        ? state.present.lineBreaks.filter(id => id !== action.tokenId)
        : state.present.lineBreaks;

      return pushHistory(state, {
        ...state.present,
        retainedTokenIds: nextRetained,
        lineBreaks: nextLineBreaks,
      });
    }

    case 'RETAIN_BATCH': {
      const set = new Set(action.tokenIds);
      const nextRetained = action.allPassageTokenIds.filter(id => set.has(id));

      return pushHistory(state, {
        ...state.present,
        retainedTokenIds: nextRetained,
        // Keep only line breaks belonging to retained tokens
        lineBreaks: state.present.lineBreaks.filter(id => set.has(id)),
      });
    }

    case 'ERASE_ALL': {
      if (state.present.retainedTokenIds.length === 0) return state;
      return pushHistory(state, {
        ...state.present,
        retainedTokenIds: [],
        lineBreaks: [],
      });
    }

    case 'RETAIN_ALL': {
      return pushHistory(state, {
        ...state.present,
        retainedTokenIds: [...action.allSelectableTokenIds],
      });
    }

    case 'TOGGLE_LINE_BREAK': {
      // Line break can only be toggled for a currently retained token
      if (!state.present.retainedTokenIds.includes(action.tokenId)) {
        return state;
      }

      const exists = state.present.lineBreaks.includes(action.tokenId);
      const nextLineBreaks = exists
        ? state.present.lineBreaks.filter(id => id !== action.tokenId)
        : [...state.present.lineBreaks, action.tokenId];

      return pushHistory(state, {
        ...state.present,
        lineBreaks: nextLineBreaks,
      });
    }

    case 'SET_ERASURE_STYLE': {
      if (state.present.erasureStyle === action.style) return state;
      return pushHistory(state, {
        ...state.present,
        erasureStyle: action.style,
      });
    }

    case 'SET_TITLE':
      return setMetadata(state, { title: action.title });

    case 'SET_NOTES':
      return setMetadata(state, { notes: action.notes });

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);

      return {
        ...state,
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);

      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }

    case 'RESET': {
      return pushHistory(state, {
        retainedTokenIds: [...action.initialSelectableTokenIds],
        lineBreaks: [],
        erasureStyle: 'blackout',
        // Resetting restores the words and style, not the poem's metadata.
        title: state.present.title,
        notes: state.present.notes,
      });
    }

    case 'LOAD_SNAPSHOT': {
      return {
        past: [],
        present: { ...action.snapshot },
        future: [],
        passageId: action.passageId,
      };
    }

    default:
      return state;
  }
}

/**
 * The snapshot to show for `passageId`. Editor state follows a passage change
 * one effect later, so while `state` still belongs to another passage this
 * returns `fallback` (the new passage's defaults) rather than a selection made
 * against the old passage's tokens.
 */
export function selectSnapshot(
  state: EditorState,
  passageId: string,
  fallback: EditorSnapshot
): { snapshot: EditorSnapshot; isStale: boolean } {
  const isStale = state.passageId !== passageId;
  return { snapshot: isStale ? fallback : state.present, isStale };
}

export function canUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}
