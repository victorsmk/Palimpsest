import { BookService } from './BookService';
import { PoemService } from './PoemService';
import { createRepositories, readBackendKind } from './container';

export { PoemService, MAX_TITLE_LENGTH, cleanTitle, copyTitle } from './PoemService';
export type { SavePoemInput } from './PoemService';
export { BookService } from './BookService';
export { FoundService, foundService } from './FoundService';
export { AssistedService, assistedService, ASSISTED_POEM_LIMIT } from './AssistedService';
export { DEFAULT_BACKEND, createRepositories, readBackendKind } from './container';
export type { BackendKind, Repositories } from './container';

// The services the screens use, built on the repositories the container chooses.
const repositories = createRepositories(readBackendKind(process.env.NEXT_PUBLIC_DATA_BACKEND));
export const poemService = new PoemService(repositories.poems);
export const bookService = new BookService(repositories.books);
