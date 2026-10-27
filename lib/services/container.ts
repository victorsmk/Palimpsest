import type { BookRepository, PoemRepository } from '@/lib/repositories';
import { BrowserBookRepository, BrowserPoemRepository } from '@/lib/repositories';
import { HttpPoemRepository } from '@/lib/repositories/http/HttpPoemRepository';
import { HttpBookRepository } from '@/lib/repositories/http/HttpBookRepository';
import { session } from '@/lib/auth/session';
import { bundledPassages } from '@/lib/library/bundled';
import { HttpTextRepository } from '@/lib/repositories/http/HttpTextRepository';
import { getAuth } from '@/lib/auth/runtime';
import { MemoryTextStorage, UserTexts, type TextStorage } from '@/lib/userTexts/UserTexts';
import { TextLibrary } from '@/lib/userTexts/TextLibrary';

/** This browser's storage for the reader's texts; where there is none (the server rendering a page) they are kept nowhere. */
function textStorage(): TextStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Storage is blocked: texts last as long as the page does.
  }
  return new MemoryTextStorage();
}

/**
 * The reader's texts: in this browser, and also (with the server backend) in their account when they are signed in,
 * so that they follow the reader to any browser.
 */
function userTexts(remote: HttpTextRepository | null): TextLibrary {
  const storage = textStorage();
  return new TextLibrary({
    local: new UserTexts(storage),
    remote,
    storage,
    whoIsSignedIn: async () => (remote && typeof window !== 'undefined' ? ((await getAuth().currentUser())?.id ?? null) : null),
  });
}

/**
 * Where this app keeps its data. This is the ONE place that decides, so that moving to a server is a
 * new entry here (and a new repository behind it), not a hunt through the services and screens.
 *
 *   "browser"  poems in this browser's storage, books bundled with the app
 *   "server"   poems on the server, through its API, for the signed-in user; books bundled, and the server's library of books
 *
 * It is chosen by the NEXT_PUBLIC_DATA_BACKEND setting; unset means "browser".
 */
export type BackendKind = 'browser' | 'server';

export const DEFAULT_BACKEND: BackendKind = 'browser';

/** The backend a setting names. Unset or blank is the default; a name that is not known is an error, said plainly, at start-up. */
export function readBackendKind(setting: string | undefined): BackendKind {
  const name = setting?.trim();
  if (!name) return DEFAULT_BACKEND;
  if (name === 'browser' || name === 'server') return name;
  throw new Error(
    `Unknown data backend "${name}". Set NEXT_PUBLIC_DATA_BACKEND to "browser" or "server", or leave it unset.`
  );
}

export interface Repositories {
  poems: PoemRepository;
  books: BookRepository;
  /** The server's library of books, when there is one. */
  library: BookRepository | null;
  /** The texts the reader has added: in this browser, or in their account when they are signed in (server backend). */
  texts: TextLibrary;
}

/** The repositories for a backend. */
export function createRepositories(kind: BackendKind): Repositories {
  const books = new BrowserBookRepository(bundledPassages);
  switch (kind) {
    case 'browser':
      return { poems: new BrowserPoemRepository(), books, library: null, texts: userTexts(null) };
    case 'server':
      return { poems: new HttpPoemRepository({ session }), books, library: new HttpBookRepository(), texts: userTexts(new HttpTextRepository({ session })) };
  }
}
