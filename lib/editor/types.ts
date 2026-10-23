import type { ErasureStyle } from '@/lib/models';

export interface EditorSnapshot {
  retainedTokenIds: string[]; // Retained token IDs in source order
  lineBreaks: string[];       // Token IDs after which a newline is rendered in extracted view
  erasureStyle: ErasureStyle;
  title: string;
}

export interface EditorState {
  past: EditorSnapshot[];
  present: EditorSnapshot;
  future: EditorSnapshot[];
  passageId: string;
}

export type EditorAction =
  | { type: 'TOGGLE_TOKEN'; tokenId: string; allPassageTokenIds: string[] }
  | { type: 'RETAIN_BATCH'; tokenIds: string[]; allPassageTokenIds: string[] }
  | { type: 'ERASE_ALL' }
  | { type: 'RETAIN_ALL'; allSelectableTokenIds: string[] }
  | { type: 'TOGGLE_LINE_BREAK'; tokenId: string }
  | { type: 'SET_ERASURE_STYLE'; style: ErasureStyle }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'LOAD_SNAPSHOT'; snapshot: EditorSnapshot; passageId: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET'; initialSelectableTokenIds: string[] };
