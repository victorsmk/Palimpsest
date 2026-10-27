import { OfflineError, RateLimitedError, UnavailableError, type Book, type Page, type PageRequest, type Passage, type PassageSummary } from '@/lib/models';
import type { BookRepository } from '@/lib/repositories';
import { tokenize } from '@/lib/tokenizer';

export interface HttpBookRepositoryOptions {
  /** Where the API is. Empty means this site, which is what the app uses. */
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';

function isAttribution(value: unknown): value is Passage['attribution'] {
  return (
    isRecord(value) &&
    isText(value.title) &&
    isText(value.author) &&
    typeof value.year === 'number' &&
    isText(value.source) &&
    isText(value.url) &&
    isText(value.licenseNote)
  );
}

function isPosition(value: unknown): value is NonNullable<Passage['position']> {
  return (
    isRecord(value) &&
    Number.isInteger(value.ordinal) &&
    Number.isInteger(value.count) &&
    (value.previousId === null || isText(value.previousId)) &&
    (value.nextId === null || isText(value.nextId))
  );
}

const isBook = (value: unknown): value is Book => isRecord(value) && (value.form === undefined || value.form === 'prose' || value.form === 'verse') && isText(value.id) && isText(value.title) && isText(value.author) && typeof value.year === 'number' && isAttribution(value.attribution);

const isSummary = (value: unknown): value is PassageSummary =>
  isRecord(value) && isText(value.id) && isText(value.bookId) && isText(value.title) && isText(value.description) && isAttribution(value.attribution);

function isPage<T>(value: unknown, isItem: (item: unknown) => item is T): value is Page<T> {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isItem) && (value.next === null || isText(value.next));
}

/**
 * The library of books, read from the server (the books everyone shares; nobody needs to be signed in). The
 * server sends an excerpt's text and this makes its words from it, with the same tokenizer that made the ids
 * of the words in saved poems. An answer that is not what the server sends is the server failing, not a
 * book that is not there.
 */
export class HttpBookRepository implements BookRepository {
  private baseUrl: string;
  private doFetch: typeof fetch;

  constructor(options: HttpBookRepositoryOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  /** The answer's JSON, or null for a 404; every other failure is thrown as the error it is. */
  private async read(path: string): Promise<unknown | null> {
    let response: Response;
    try {
      response = await this.doFetch(`${this.baseUrl}${path}`, { method: 'GET', headers: { Accept: 'application/json' } });
    } catch (cause) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError({ cause });
      throw new UnavailableError({ cause });
    }
    if (response.status === 404) return null;
    if (response.status === 429) throw new RateLimitedError();
    if (!response.ok) throw new UnavailableError({ cause: new Error(`The server answered ${response.status}`) });
    try {
      return await response.json();
    } catch (cause) {
      throw new UnavailableError({ cause });
    }
  }

  private wrong(what: string): never {
    throw new UnavailableError({ cause: new Error(`The library sent ${what} that is not what was expected`) });
  }

  private query(request: PageRequest | undefined, extra: Record<string, string | undefined> = {}): string {
    const params = new URLSearchParams();
    if (request?.after !== undefined) params.set('after', request.after);
    if (request?.limit !== undefined) params.set('limit', String(request.limit));
    for (const [name, value] of Object.entries(extra)) if (value) params.set(name, value);
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  async listBooks(page?: PageRequest & { search?: string }): Promise<Page<Book>> {
    const body = await this.read(`/api/library/books${this.query(page, { search: page?.search })}`);
    if (!isPage(body, isBook)) return this.wrong('a list of books');
    return body;
  }

  async getBook(id: string): Promise<Book | null> {
    const body = await this.read(`/api/library/books/${encodeURIComponent(id)}`);
    if (body === null) return null;
    if (!isBook(body)) return this.wrong('a book');
    return body;
  }

  async randomPassageId(): Promise<string | null> {
    const body = await this.read('/api/library/random');
    if (body === null) return null;
    if (!isRecord(body) || !isText(body.id)) return this.wrong('an excerpt');
    return body.id;
  }

  async getPassage(id: string): Promise<Passage | null> {
    const body = await this.read(`/api/library/passages/${encodeURIComponent(id)}`);
    if (body === null) return null;
    if (!isSummary(body)) return this.wrong('a passage');
    const sourceText = (body as unknown as Record<string, unknown>).sourceText;
    const position = (body as unknown as Record<string, unknown>).position;
    if (!isText(sourceText) || (position !== undefined && !isPosition(position))) return this.wrong('a passage');
    return {
      id: body.id,
      bookId: body.bookId,
      title: body.title,
      description: body.description,
      sourceText,
      tokens: tokenize(body.id, sourceText),
      attribution: body.attribution,
      ...(position === undefined ? {} : { position }),
    };
  }

  /** The excerpts of one book. The library is too big to list every excerpt of every book, so a book must be named. */
  async listPassageSummaries(request?: PageRequest & { bookId?: string }): Promise<Page<PassageSummary>> {
    if (request?.bookId === undefined) return { items: [], next: null };
    const body = await this.read(`/api/library/books/${encodeURIComponent(request.bookId)}/passages${this.query(request)}`);
    if (body === null) return { items: [], next: null };
    if (!isPage(body, isSummary)) return this.wrong('a list of passages');
    return body;
  }
}
