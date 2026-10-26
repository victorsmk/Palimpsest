import { BookService } from './BookService';
import { PoemService } from './PoemService';
import { createRepositories, readBackendKind } from './container';
import { getAuth } from '@/lib/auth/runtime';
import { session, setSessionSource } from '@/lib/auth/session';
import { AccountApi } from '@/lib/account/AccountApi';

export { PoemService, MAX_TITLE_LENGTH, cleanTitle, copyTitle } from './PoemService';
export type { SavePoemInput } from './PoemService';
export { BookService } from './BookService';
export { FoundService, foundService } from './FoundService';
export { AssistedService, assistedService, ASSISTED_POEM_LIMIT } from './AssistedService';
export { DEFAULT_BACKEND, createRepositories, readBackendKind } from './container';
export type { BackendKind, Repositories } from './container';

// The services the screens use, built on the repositories the container chooses.
export const backendKind = readBackendKind(process.env.NEXT_PUBLIC_DATA_BACKEND);
const repositories = createRepositories(backendKind);
// With the poems on the server, the data layer gets its token from whoever is signed in (browser only: nothing asks before then).
if (backendKind === 'server') setSessionSource({ getToken: () => getAuth().getToken() });
export const poemService = new PoemService(repositories.poems);
export const bookService = new BookService(repositories.books);
/** Deleting the account. Only works with the poems on the server. */
export const accountApi = new AccountApi({ session });
