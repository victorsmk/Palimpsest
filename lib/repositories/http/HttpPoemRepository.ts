import type { PoemRepository } from '@/lib/repositories';
import {
  OfflineError,
  PoemConflictError,
  PoemExistsError,
  PoemGoneError,
  PoemLimitError,
  RateLimitedError,
  UnauthorizedError,
  UnavailableError,
  parsePoemSummary,
  type Page,
  type PageRequest,
  type Poem,
  type PoemDraft,
  type PoemSummary,
} from '@/lib/models';
import { parsePoem } from '@/lib/models/poemValidation';
import type { SessionSource } from '@/lib/auth/session';

export interface HttpPoemRepositoryOptions {
  /** Who is signed in; the token is sent with every request. With nobody, nothing is sent at all. */
  session: SessionSource;
  /** Where the API is. Empty means this site, which is what the app uses. */
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

/** The kinds of answer the API gives for a mistake of the client's own: nothing a writer can act on. */
class BadRequest extends Error {}

/** The content of a draft and nothing else, so that a whole poem passed in as one does not send its id, times or revision. */
function contentOf(draft: PoemDraft): PoemDraft {
  const body: PoemDraft = {
    passageId: draft.passageId,
    retainedTokenIds: draft.retainedTokenIds,
    lineBreaks: draft.lineBreaks,
    erasureStyle: draft.erasureStyle,
  };
  if (draft.title !== undefined) body.title = draft.title;
  if (draft.notes !== undefined) body.notes = draft.notes;
  if (draft.passageVersion) body.passageVersion = draft.passageVersion;
  return body;
}

/**
 * A user's poems on the server, through the poems API (see lib/server/api): the same PoemRepository the
 * browser's own storage keeps, so the screens do not know the difference. Each answer is checked as
 * strictly as a poem read from storage, and every failure becomes one of the typed errors: not signed
 * in, a conflict (with the poem as stored), gone, a limit (in the server's own words), rate limited, and
 * offline or unavailable when the server cannot be reached or does not make sense.
 */
export class HttpPoemRepository implements PoemRepository {
  private session: SessionSource;
  private baseUrl: string;
  private doFetch: typeof fetch;

  constructor(options: HttpPoemRepositoryOptions) {
    this.session = options.session;
    this.baseUrl = options.baseUrl ?? '';
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  /** Sends a request as the signed-in user and returns the answer if it was a success; otherwise throws the matching error. */
  private async send(method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
    const token = await this.session.getToken();
    if (!token) throw new UnauthorizedError();

    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...options.headers };
    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await this.doFetch(`${this.baseUrl}${path}`, { method, headers, body, cache: 'no-store' });
    } catch (cause) {
      // The request never got an answer: there is no connection, or the server is not there.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError({ cause });
      throw new UnavailableError({ cause });
    }
    if (response.ok) return response;
    throw await this.failure(response);
  }

  /** The error for an answer that says no. */
  private async failure(response: Response): Promise<Error> {
    let error: { code?: unknown; message?: unknown; current?: unknown } = {};
    try {
      const body = (await response.json()) as { error?: typeof error };
      if (body && typeof body.error === 'object' && body.error !== null) error = body.error;
    } catch {
      /* not our API's answer (a proxy's page, for example): handled by status below */
    }
    const message = typeof error.message === 'string' ? error.message : '';

    switch (response.status) {
      case 401:
        return new UnauthorizedError();
      case 404:
        return new PoemGoneError();
      case 409: {
        if (error.code === 'exists') return new PoemExistsError();
        const current = parsePoem(error.current);
        return current ? new PoemConflictError(current) : new UnavailableError({ cause: new Error('A conflict came without the poem') });
      }
      case 422:
        return new PoemLimitError(message || 'That is over a limit.');
      case 429:
        return new RateLimitedError();
      case 400:
      case 413:
      case 415:
      case 428:
        return new BadRequest(`The server could not use that request (${response.status}): ${message}`);
      default:
        return new UnavailableError({ cause: new Error(`The server answered ${response.status}`) });
    }
  }

  /** The body of a success as JSON; an answer that is not JSON (or is empty) is the server failing, not the writer's doing. */
  private async read(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new UnavailableError({ cause });
    }
  }

  private poem(raw: unknown): Poem {
    const poem = parsePoem(raw);
    if (!poem) throw new UnavailableError({ cause: new Error('The server sent a poem that is not valid') });
    return poem;
  }

  private page<T>(raw: unknown, item: (entry: unknown) => T): Page<T> {
    const body = raw as { items?: unknown; next?: unknown } | null;
    if (!body || !Array.isArray(body.items) || !(body.next === null || typeof body.next === 'string')) {
      throw new UnavailableError({ cause: new Error('The server sent a page that is not valid') });
    }
    return { items: body.items.map(item), next: body.next };
  }

  private pageQuery(request: PageRequest | undefined, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams(extra);
    if (request?.after !== undefined) params.set('after', request.after);
    if (typeof request?.limit === 'number' && Number.isFinite(request.limit)) params.set('limit', String(request.limit));
    const query = params.toString();
    return query ? `?${query}` : '';
  }

  async create(draft: PoemDraft): Promise<Poem> {
    return this.poem(await this.read(await this.send('POST', '/api/poems', { body: contentOf(draft) })));
  }

  async update(id: string, draft: PoemDraft, expectedRevision: number): Promise<Poem> {
    const response = await this.send('PUT', `/api/poems/${encodeURIComponent(id)}`, {
      body: contentOf(draft),
      headers: { 'If-Match': String(expectedRevision) },
    });
    return this.poem(await this.read(response));
  }

  async importMany(poems: Poem[]): Promise<void> {
    // An id is a key in the stored object of some repositories, and "__proto__" is not an ordinary key there.
    if (poems.some(poem => poem.id === '__proto__')) throw new Error('That poem cannot be stored.');
    if (poems.length === 0) return;
    await this.send('POST', '/api/collection/import', { body: { poems } });
  }

  async get(id: string): Promise<Poem | null> {
    try {
      return this.poem(await this.read(await this.send('GET', `/api/poems/${encodeURIComponent(id)}`)));
    } catch (error) {
      // For a read, "not there" is an answer, not a failure.
      if (error instanceof PoemGoneError) return null;
      throw error;
    }
  }

  async getMany(ids: string[]): Promise<Poem[]> {
    if (ids.length === 0) return [];
    const raw = (await this.read(await this.send('POST', '/api/collection/lookup', { body: { ids } }))) as { poems?: unknown } | null;
    if (!raw || !Array.isArray(raw.poems)) throw new UnavailableError({ cause: new Error('The server sent a list that is not valid') });
    return raw.poems.map(entry => this.poem(entry));
  }

  async count(): Promise<number> {
    const raw = (await this.read(await this.send('GET', '/api/collection/count'))) as { count?: unknown } | null;
    if (!raw || typeof raw.count !== 'number' || !Number.isInteger(raw.count) || raw.count < 0) {
      throw new UnavailableError({ cause: new Error('The server sent a count that is not valid') });
    }
    return raw.count;
  }

  async listSummaries(page?: PageRequest): Promise<Page<PoemSummary>> {
    const raw = await this.read(await this.send('GET', `/api/poems${this.pageQuery(page)}`));
    return this.page(raw, entry => {
      const summary = parsePoemSummary(entry);
      if (!summary) throw new UnavailableError({ cause: new Error('The server sent a summary that is not valid') });
      return summary;
    });
  }

  async list(page?: PageRequest): Promise<Page<Poem>> {
    const raw = await this.read(await this.send('GET', `/api/poems${this.pageQuery(page, { full: '1' })}`));
    return this.page(raw, entry => this.poem(entry));
  }

  async delete(id: string): Promise<void> {
    await this.send('DELETE', `/api/poems/${encodeURIComponent(id)}`);
  }
}
