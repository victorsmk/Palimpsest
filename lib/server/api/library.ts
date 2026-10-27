import { RepositoryError, UnavailableError } from '@/lib/models';
import type { Db } from '../db';
import { LibraryReader } from '../library';
import { errorResponse, json, problem } from './http';
import { SAFE_ID, pageRequestOf } from './validate';

/**
 * How long the library may be kept by a browser or by Vercel's servers in front of the app. The text of an
 * excerpt never changes once it is imported, so it can be kept for as long as anyone likes. The lists
 * change only when books are imported, so they are kept for minutes, and may be shown a little stale for
 * longer while a fresh copy is fetched.
 */
export const CACHE_PASSAGE = 'public, max-age=86400, s-maxage=31536000, immutable';
export const CACHE_LIST = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

const SEARCH_MAX = 100;

/**
 * The library's side of the API: public, read-only, no sign-in. It is for the books everyone shares, not for
 * anyone's poems. A flood of requests is for Vercel's firewall rule to stop (DEPLOYMENT.md), since there is
 * no user to count them against.
 */
export function createLibraryApi(deps: { db: Db }) {
  const reader = new LibraryReader(deps.db);

  async function answer(work: () => Promise<Response>): Promise<Response> {
    try {
      return await work();
    } catch (error) {
      return errorResponse(error instanceof RepositoryError ? error : new UnavailableError({ cause: error }));
    }
  }

  const notFound = (what: string) => problem(404, 'gone', `That ${what} is not in the library.`);

  return {
    /** GET /api/library/books?search=&after=&limit= — a page of books, by title. */
    books: (request: Request) =>
      answer(async () => {
        const url = new URL(request.url);
        const search = url.searchParams.get('search') ?? '';
        if (search.length > SEARCH_MAX) return problem(400, 'invalid', `A search can be at most ${SEARCH_MAX} characters.`);
        return json(await reader.listBooks({ ...pageRequestOf(url), search }), 200, { 'Cache-Control': CACHE_LIST });
      }),

    /** GET /api/library/books/:id */
    book: (request: Request, id: string) =>
      answer(async () => {
        const book = SAFE_ID.test(id) ? await reader.getBook(id) : null;
        return book ? json(book, 200, { 'Cache-Control': CACHE_LIST }) : notFound('book');
      }),

    /** GET /api/library/books/:id/passages?after=&limit= — a page of the book's excerpts, without their text. */
    bookPassages: (request: Request, id: string) =>
      answer(async () => {
        if (!SAFE_ID.test(id) || !(await reader.getBook(id))) return notFound('book');
        return json(await reader.listPassages(id, pageRequestOf(new URL(request.url))), 200, { 'Cache-Control': CACHE_LIST });
      }),

    /** GET /api/library/passages/:id — one excerpt with its text. */
    passage: (request: Request, id: string) =>
      answer(async () => {
        const passage = SAFE_ID.test(id) ? await reader.getPassage(id) : null;
        return passage ? json(passage, 200, { 'Cache-Control': CACHE_PASSAGE }) : notFound('passage');
      }),

    /** GET /api/library/random — the id of an excerpt chosen at random. Never kept: the next ask is a different one. */
    random: () =>
      answer(async () => {
        const id = await reader.randomPassageId();
        return id ? json({ id }, 200, { 'Cache-Control': 'no-store' }) : notFound('passage');
      }),

    /** For the health page. */
    check: () => reader.check(),
  };
}

export type LibraryApi = ReturnType<typeof createLibraryApi>;
