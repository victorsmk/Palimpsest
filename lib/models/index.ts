// ─── Attribution ───────────────────────────────────────────────────────────────

export interface Attribution {
  title: string;
  author: string;
  year: number;
  source: string;       // e.g. "Project Gutenberg"
  url: string;          // Gutenberg ebook URL
  licenseNote: string;  // e.g. "Public domain in the USA"
}

// ─── Token ─────────────────────────────────────────────────────────────────────

export type TokenKind = 'word' | 'separator';

export interface Token {
  id: string;             // Stable ID, e.g. "jane-eyre-ch1-token-0042"
  text: string;           // Display text with attached punctuation, e.g. "breakfast,"
  word: string;           // Normalized lowercase bare word for lookup, e.g. "breakfast"
  position: number;       // 0-indexed token order in the passage
  paragraphIndex: number;
  lineBreakBefore: boolean;
  kind: TokenKind;        // 'word' or 'separator' (such as em dash '—')
  isSelectable: boolean;  // false for separators
}

// ─── Book & Passage ────────────────────────────────────────────────────────────

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  attribution: Attribution;
}

export interface Passage {
  id: string;
  bookId: string;
  title: string;          // e.g. "Jane Eyre — Chapter 1 Opening"
  description: string;
  sourceText: string;     // Immutable original text
  tokens: Token[];
  attribution: Attribution;
}

// ─── Erasure & Poem ────────────────────────────────────────────────────────────

export type ErasureStyle = 'blackout' | 'faded' | 'whiteout';

export interface PoemLine {
  tokenIds: string[];     // Retained token IDs for this line in source order
}

/** Current persisted-poem schema version; bump when the Poem shape changes. */
export const POEM_SCHEMA_VERSION = 1;

export interface Poem {
  id: string;
  schemaVersion: number;  // For future data migration support
  passageId: string;
  retainedTokenIds: string[];  // In source order
  lineBreaks: string[];        // Token IDs after which a line break is rendered
  erasureStyle: ErasureStyle;
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
  title?: string;
  notes?: string;
}

export interface Collection {
  id: string;
  name: string;
  poemIds: string[];
  createdAt: string;
  updatedAt: string;
}
