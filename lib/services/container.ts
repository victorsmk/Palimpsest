import type { BookRepository, PoemRepository } from '@/lib/repositories';
import { BrowserBookRepository, BrowserPoemRepository } from '@/lib/repositories';
import { HttpPoemRepository } from '@/lib/repositories/http/HttpPoemRepository';
import { session } from '@/lib/auth/session';
import { bundledPassages } from '@/lib/library/bundled';

/**
 * Where this app keeps its data. This is the ONE place that decides, so that moving to a server is a
 * new entry here (and a new repository behind it), not a hunt through the services and screens.
 *
 *   "browser"  poems in this browser's storage, books bundled with the app
 *   "server"   poems on the server, through its API, for the signed-in user; books still bundled
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
}

/** The repositories for a backend. */
export function createRepositories(kind: BackendKind): Repositories {
  const books = new BrowserBookRepository(bundledPassages);
  switch (kind) {
    case 'browser':
      return { poems: new BrowserPoemRepository(), books };
    case 'server':
      return { poems: new HttpPoemRepository({ session }), books };
  }
}
