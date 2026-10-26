import type { PoemRepository } from '@/lib/repositories';
import {
  PoemGoneError,
  UnavailableError,
  parsePoemSummary,
  type Page,
  type PageRequest,
  type Poem,
  type PoemDraft,
  type PoemSummary,
} from '@/lib/models';
import { parsePoem } from '@/lib/models/poemValidation';
import { ApiClient, type ApiClientOptions } from './ApiClient';

export interface HttpPoemRepositoryOptions extends ApiClientOptions {
  /** How much goes in one request when many poems are imported. For tests; the defaults keep a request well under the server's limits. */
  importBatch?: { bytes: number; poems: number };
}

/** A request to import is kept below the 5 MB the server takes (and the few MB a host takes), and a few hundred poems. */
const DEFAULT_IMPORT_BATCH = { bytes: 3 * 1024 * 1024, poems: 400 };

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
  private api: ApiClient;
  private importBatch: { bytes: number; poems: number };

  constructor(options: HttpPoemRepositoryOptions) {
    this.api = new ApiClient(options);
    this.importBatch = options.importBatch ?? DEFAULT_IMPORT_BATCH;
  }

  private send(method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}) {
    return this.api.send(method, path, options);
  }

  private read(response: Response) {
    return this.api.read(response);
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
    // Many poems go in several requests. Each request is all or none; the poems already added stay added
    // if a later request fails, and since an import only ever adds, doing it again finishes the job.
    let batch: Poem[] = [];
    let bytes = 0;
    for (const poem of poems) {
      const size = JSON.stringify(poem).length;
      if (batch.length > 0 && (batch.length >= this.importBatch.poems || bytes + size > this.importBatch.bytes)) {
        await this.send('POST', '/api/collection/import', { body: { poems: batch } });
        batch = [];
        bytes = 0;
      }
      batch.push(poem);
      bytes += size;
    }
    if (batch.length > 0) await this.send('POST', '/api/collection/import', { body: { poems: batch } });
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
