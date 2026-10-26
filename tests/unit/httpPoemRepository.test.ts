import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpPoemRepository } from '@/lib/repositories/http/HttpPoemRepository';
import {
  OfflineError,
  PoemConflictError,
  PoemExistsError,
  PoemGoneError,
  PoemLimitError,
  RateLimitedError,
  RepositoryError,
  UnauthorizedError,
  UnavailableError,
  parsePoemSummary,
  summarizePoem,
} from '@/lib/models';
import { draftOf, poem } from '../contract/poemRepositoryContract';

// How the browser's repository talks to the API and what it makes of the answers, with a stand-in for
// the network. (That the two ends work together is shown by the contract suite, run through the
// real handlers: poemRepositoryContract.http.test.ts.)

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  cache: unknown;
}

function setup(answer: (sent: Sent) => Response | Promise<Response> = () => Response.json({})) {
  const sent: Sent[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const record: Sent = { url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body === undefined ? undefined : JSON.parse(init.body as string), cache: init.cache };
    sent.push(record);
    return answer(record);
  });
  const getToken = vi.fn(async (): Promise<string | null> => 'the-token');
  const repo = new HttpPoemRepository({ session: { getToken }, fetch: fetcher as unknown as typeof fetch });
  return { repo, sent, fetcher, getToken };
}

const error = (status: number, code: string, message = 'words from the server', extra: Record<string, unknown> = {}) =>
  Response.json({ error: { code, message, ...extra } }, { status });

const stored = poem('abc', { revision: 3 });

afterEach(() => vi.unstubAllGlobals());

describe('what is sent', () => {
  it('nothing at all when nobody is signed in: the writer is told to sign in', async () => {
    const { repo, fetcher, getToken } = setup();
    getToken.mockResolvedValue(null);
    for (const call of [() => repo.get('a'), () => repo.count(), () => repo.create(draftOf(stored)), () => repo.delete('a'), () => repo.listSummaries()]) {
      await expect(call()).rejects.toBeInstanceOf(UnauthorizedError);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('the token as a bearer, JSON for a body, and the revision as If-Match, with nothing cached', async () => {
    const { repo, sent } = setup(() => Response.json(stored));
    await repo.update('abc', draftOf(stored), 3);
    expect(sent[0]).toMatchObject({ url: '/api/poems/abc', method: 'PUT', cache: 'no-store' });
    expect(sent[0].headers).toEqual({ Authorization: 'Bearer the-token', 'If-Match': '3', 'Content-Type': 'application/json' });
  });

  it('only the content of a poem, even when a whole poem is passed in as the draft', async () => {
    const { repo, sent } = setup(() => Response.json(stored, { status: 201 }));
    await repo.create(stored); // a whole poem: id, revision and times must not be sent
    expect(Object.keys(sent[0].body as object).sort()).toEqual(['erasureStyle', 'lineBreaks', 'notes', 'passageId', 'retainedTokenIds', 'title']);
  });

  it('leaves out a title, notes and passage version the draft does not have', async () => {
    const { repo, sent } = setup(() => Response.json(stored, { status: 201 }));
    const bare = draftOf(stored);
    delete bare.title;
    delete bare.notes;
    await repo.create(bare);
    expect(Object.keys(sent[0].body as object).sort()).toEqual(['erasureStyle', 'lineBreaks', 'passageId', 'retainedTokenIds']);
  });

  it('an id in the address with everything that could change its meaning written out', async () => {
    const { repo, sent } = setup(() => new Response(null, { status: 204 }));
    await repo.delete('a b/c?d#e');
    expect(sent[0].url).toBe('/api/poems/a%20b%2Fc%3Fd%23e');
  });

  it('GET and DELETE carry no body and no content type', async () => {
    const { repo, sent } = setup(() => new Response(null, { status: 204 }));
    await repo.delete('a');
    expect(sent[0].body).toBeUndefined();
    expect(sent[0].headers).toEqual({ Authorization: 'Bearer the-token' });
  });

  it('goes to the base address it is given', async () => {
    const fetcher = vi.fn(async () => Response.json({ count: 2 }));
    const repo = new HttpPoemRepository({ session: { getToken: async () => 't' }, baseUrl: 'https://example.org', fetch: fetcher as unknown as typeof fetch });
    await repo.count();
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe('https://example.org/api/collection/count');
  });

  it('a page asked for: the cursor even when empty, the limit when it is a number, and full for whole poems', async () => {
    const empty = { items: [], next: null };
    const { repo, sent } = setup(() => Response.json(empty));
    await repo.listSummaries();
    await repo.listSummaries({ after: '' });
    await repo.listSummaries({ after: 'x|y', limit: 5 });
    await repo.listSummaries({ limit: Number.NaN });
    await repo.listSummaries({ limit: Number.POSITIVE_INFINITY });
    await repo.list({ after: 'c', limit: 2 });
    expect(sent.map(s => s.url)).toEqual([
      '/api/poems',
      '/api/poems?after=',
      '/api/poems?after=x%7Cy&limit=5',
      '/api/poems',
      '/api/poems',
      '/api/poems?full=1&after=c&limit=2',
    ]);
  });

  it('no request for nothing to look up or nothing to add', async () => {
    const { repo, fetcher } = setup();
    expect(await repo.getMany([])).toEqual([]);
    await repo.importMany([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses a poem called __proto__ without asking the server', async () => {
    const { repo, fetcher } = setup();
    await expect(repo.importMany([poem('fine'), poem('__proto__')])).rejects.toThrow('That poem cannot be stored.');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('what the answers mean', () => {
  it('401: not signed in', async () => {
    await expect(setup(() => error(401, 'unauthorized')).repo.count()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('404 on a save: the poem is gone; on a read: there is no such poem', async () => {
    const { repo } = setup(() => error(404, 'gone'));
    await expect(repo.update('a', draftOf(stored), 1)).rejects.toBeInstanceOf(PoemGoneError);
    expect(await repo.get('a')).toBeNull();
  });

  it('409 conflict: the conflict, with the poem as it is stored now', async () => {
    const { repo } = setup(() => error(409, 'conflict', 'x', { current: stored }));
    const caught = (await repo.update('abc', draftOf(stored), 1).catch(e => e)) as PoemConflictError;
    expect(caught).toBeInstanceOf(PoemConflictError);
    expect(caught.current).toEqual(stored);
  });

  it('409 conflict without a usable poem is the server failing, not a conflict the writer can act on', async () => {
    for (const current of [undefined, null, { id: 'x' }, 'text']) {
      const { repo } = setup(() => error(409, 'conflict', 'x', { current }));
      await expect(repo.update('abc', draftOf(stored), 1)).rejects.toBeInstanceOf(UnavailableError);
    }
  });

  it('409 exists: an id already stored', async () => {
    await expect(setup(() => error(409, 'exists')).repo.importMany([stored])).rejects.toBeInstanceOf(PoemExistsError);
  });

  it('422: over a limit, in the server’s own words', async () => {
    const { repo } = setup(() => error(422, 'limit', 'Notes can be at most 10,000 characters.'));
    const caught = (await repo.create(draftOf(stored)).catch(e => e)) as PoemLimitError;
    expect(caught).toBeInstanceOf(PoemLimitError);
    expect(caught.message).toBe('Notes can be at most 10,000 characters.');
  });

  it('429: rate limited', async () => {
    await expect(setup(() => error(429, 'rate-limited')).repo.count()).rejects.toBeInstanceOf(RateLimitedError);
  });

  it.each([400, 413, 415, 428])('%i: the app’s own mistake, which is not something to show a writer as it is', async status => {
    const caught = await setup(() => error(status, 'invalid', 'a detail')).repo.create(draftOf(stored)).catch(e => e);
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(RepositoryError);
    expect(caught.message).toContain(String(status));
    expect(caught.message).toContain('a detail');
  });

  it.each([500, 502, 503, 504, 418])('%i: the server is unavailable', async status => {
    await expect(setup(() => error(status, 'unavailable')).repo.count()).rejects.toBeInstanceOf(UnavailableError);
  });

  it('an answer that is not the API’s (a proxy’s page) is the server being unavailable, whatever its status', async () => {
    for (const status of [502, 503, 404, 500]) {
      const { repo } = setup(() => new Response('<html>Bad gateway</html>', { status, headers: { 'Content-Type': 'text/html' } }));
      const caught = await repo.update('a', draftOf(stored), 1).catch(e => e);
      // A 404 is read as "gone" by status alone; every other status here is unavailable.
      expect(caught).toBeInstanceOf(status === 404 ? PoemGoneError : UnavailableError);
    }
  });

  it('no answer at all is the server being unavailable, with the cause kept', async () => {
    const cause = new TypeError('fetch failed');
    const repo = new HttpPoemRepository({ session: { getToken: async () => 't' }, fetch: (async () => Promise.reject(cause)) as unknown as typeof fetch });
    const caught = await repo.count().catch(e => e);
    expect(caught).toBeInstanceOf(UnavailableError);
    expect(caught.cause).toBe(cause);
  });

  it('no answer at all, when the browser says it is offline, is being offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const repo = new HttpPoemRepository({ session: { getToken: async () => 't' }, fetch: (async () => Promise.reject(new TypeError('x'))) as unknown as typeof fetch });
    await expect(repo.count()).rejects.toBeInstanceOf(OfflineError);
  });
});

describe('answers that are not what the API gives', () => {
  const bad: [string, () => Response][] = [
    ['not JSON', () => new Response('nope')],
    ['empty', () => new Response('')],
    ['JSON of the wrong shape', () => Response.json({ surprise: true })],
  ];

  it.each(bad)('are the server failing, never believed: %s', async (_label, answer) => {
    const { repo } = setup(answer);
    await expect(repo.create(draftOf(stored))).rejects.toBeInstanceOf(UnavailableError);
    await expect(repo.get('a')).rejects.toBeInstanceOf(UnavailableError);
    await expect(repo.count()).rejects.toBeInstanceOf(UnavailableError);
    await expect(repo.listSummaries()).rejects.toBeInstanceOf(UnavailableError);
    await expect(repo.list()).rejects.toBeInstanceOf(UnavailableError);
    await expect(repo.getMany(['a'])).rejects.toBeInstanceOf(UnavailableError);
  });

  it('a poem that is not a valid poem is not believed', async () => {
    const { repo } = setup(() => Response.json({ ...stored, erasureStyle: 'sparkle' }));
    await expect(repo.get('abc')).rejects.toBeInstanceOf(UnavailableError);
  });

  it('a page with one bad entry is not believed', async () => {
    const summary = summarizePoem(stored);
    const { repo } = setup(() => Response.json({ items: [summary, { ...summary, wordCount: -1 }], next: null }));
    await expect(repo.listSummaries()).rejects.toBeInstanceOf(UnavailableError);
    const { repo: pages } = setup(() => Response.json({ items: [], next: 5 }));
    await expect(pages.listSummaries()).rejects.toBeInstanceOf(UnavailableError);
  });

  it('a count that is not a count is not believed', async () => {
    for (const count of [-1, 1.5, '3', null]) {
      await expect(setup(() => Response.json({ count })).repo.count()).rejects.toBeInstanceOf(UnavailableError);
    }
  });

  it('a good answer is believed', async () => {
    const summary = summarizePoem(stored);
    const { repo } = setup(() => Response.json({ items: [summary], next: 'c' }));
    expect(await repo.listSummaries()).toEqual({ items: [summary], next: 'c' });
  });
});

describe('a summary read from untrusted data', () => {
  const good = summarizePoem(poem('a', { passageVersion: 't1-0123456789abcdef' }));

  it('is the summary, when it is one', () => {
    expect(parsePoemSummary(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it('keeps nothing it does not know', () => {
    expect(parsePoemSummary({ ...good, notes: 'secret', retainedTokenIds: ['x'] })).toEqual(good);
  });

  it.each([
    ['null', null],
    ['a list', []],
    ['no id', { ...good, id: '' }],
    ['a revision of 0', { ...good, revision: 0 }],
    ['a fractional word count', { ...good, wordCount: 1.5 }],
    ['an unknown style', { ...good, erasureStyle: 'x' }],
    ['a date that is not one', { ...good, updatedAt: 'yesterday' }],
    ['a title that is not text', { ...good, title: 5 }],
    ['a preview that is not one', { ...good, preview: [] }],
    ['a preview line that is not a list of text', { ...good, preview: { lines: [[1]], more: false } }],
    ['a preview with no more', { ...good, preview: { lines: [] } }],
  ])('is refused with %s', (_label, raw) => {
    expect(parsePoemSummary(raw)).toBeNull();
  });
});
