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

/** A passage without its text and words: what a list of passages needs, small enough to list them all. */
export type PassageSummary = Omit<Passage, 'tokens' | 'sourceText'> & {
  /** How many words the passage has, when the source knows (the library's excerpts do). */
  wordCount?: number;
};

/** A passage's summary. */
export function summaryOf(passage: Passage): PassageSummary {
  return { id: passage.id, bookId: passage.bookId, title: passage.title, description: passage.description, attribution: passage.attribution };
}

/** Which page of a long list is wanted: the one after the item `after` names (from the previous page's `next`). */
export interface PageRequest {
  after?: string;
  /** How many items at most. Clamped to 1..LIMITS.pageMax; LIMITS.pageDefault when left out. */
  limit?: number;
}

/** One page of a list in its fixed order. `next` is what to ask for after it, or null on the last page. */
export interface Page<T> {
  items: T[];
  next: string | null;
}

// ─── Erasure & Poem ────────────────────────────────────────────────────────────

export type ErasureStyle = 'blackout' | 'faded' | 'whiteout';

export interface PoemLine {
  tokenIds: string[];     // Retained token IDs for this line in source order
}

/**
 * Current persisted-poem schema version; bump when the Poem shape changes.
 *  1  the first shape: ids made by the browser, no revision, no passage version.
 *  2  an id from the store (a UUID), a revision, and the version of the passage text it was made from.
 * Version 1 poems are still read (see poemValidation.ts) and become version 2 in memory.
 */
export const POEM_SCHEMA_VERSION = 2;

export interface Poem {
  /** Opaque: made by the store, a UUID. Nothing should read anything into it. */
  id: string;
  schemaVersion: number;  // For future data migration support
  /**
   * Counts saves: 1 when the poem is created, and one more each time it is saved. A save says which
   * revision it started from, so that it cannot silently overwrite a newer one.
   */
  revision: number;
  passageId: string;
  /**
   * Fingerprint of the exact passage text (and tokenizer) the poem was made from; see passageVersionOf.
   * Missing on poems made before it was recorded, which are checked by their words alone.
   */
  passageVersion?: string;
  retainedTokenIds: string[];  // In source order
  lineBreaks: string[];        // Token IDs after which a line break is rendered
  erasureStyle: ErasureStyle;
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
  title?: string;
  notes?: string;
}

/**
 * What a writer supplies when saving a poem: its content only. The store assigns the id, the times
 * and the revision, so a caller cannot choose them.
 */
export type PoemDraft = Omit<Poem, 'id' | 'schemaVersion' | 'revision' | 'createdAt' | 'updatedAt'>;

export interface Collection {
  id: string;
  name: string;
  poemIds: string[];
  createdAt: string;
  updatedAt: string;
}

export { LIMITS } from './limits';
export { TOKENIZER_VERSION, legacyPoemId, passageVersionOf } from './versions';
export { fingerprint, newId, uuidV5 } from './uuid';
export { PREVIEW_LINES, PREVIEW_WORDS_PER_LINE, parsePoemSummary, previewHeadOf, summarizePoem } from './summary';
export type { PoemPreviewHead, PoemSummary } from './summary';
export {
  RepositoryError,
  PoemLimitError,
  PoemConflictError,
  PoemGoneError,
  PoemExistsError,
  StorageError,
  OfflineError,
  UnauthorizedError,
  RateLimitedError,
  UnavailableError,
  storageFailureOf,
} from './errors';
export type { RepositoryErrorCode, StorageFailure } from './errors';
export { parsePoem, poemLimitProblem } from './poemValidation';
