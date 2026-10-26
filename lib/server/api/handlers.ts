import { LIMITS, UnavailableError, type PoemDraft } from '@/lib/models';
import type { PoemRepository } from '@/lib/repositories';
import type { AccountStore } from './accounts';
import type { Authenticator } from './auth';
import { RequestProblem, errorResponse, json, noContent, problem } from './http';
import { SAFE_ID, pageRequestOf, revisionOfIfMatch, validateDraft, validateIds, validatePoems, type Checked } from './validate';

/** The largest body of a request that holds one poem (a poem is at most a few hundred kilobytes). */
const POEM_BODY_MAX = 1024 * 1024;
/** A list of ids, or a backup's worth of poems. */
const IMPORT_BODY_MAX = LIMITS.backupBytesMax;

export interface ApiDeps {
  /** Who is asking. Called first, before anything of the request is read. */
  authenticate: Authenticator;
  /** The poems of one user. */
  poemsOf(userId: string): PoemRepository;
  /** Deleting an account. Left out, deleting is answered as not available. */
  accounts?: AccountStore;
}

/** The body of a request as JSON: it must say it is JSON, must not be larger than `max`, and must parse. */
async function readJson(request: Request, max: number): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new RequestProblem(415, 'Send the request as JSON.');
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) throw new RequestProblem(413, 'The request is too large.');
  const text = await request.text();
  if (text.length > max) throw new RequestProblem(413, 'The request is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestProblem(400, 'The request is not valid JSON.');
  }
}

function accept<T>(checked: Checked<T>): T {
  if (!checked.ok) throw new RequestProblem(checked.status, checked.message);
  return checked.value;
}

/**
 * The poems API as plain functions from a Request to a Response, so it can be run and tested without
 * a web server; the files under app/api only hand a request to one of these. Each does the same
 * things in the same order: find out who is asking (nothing else is read before that), check what was
 * sent, do it for that user only, and turn anything that goes wrong into the one kind of error body.
 */
export function createPoemsApi(deps: ApiDeps) {
  /** Runs `work` for the signed-in user and turns every failure into a response. */
  async function handle(request: Request, work: (poems: PoemRepository) => Promise<Response>): Promise<Response> {
    try {
      const userId = await deps.authenticate(request);
      return await work(deps.poemsOf(userId));
    } catch (error) {
      return errorResponse(error);
    }
  }

  /** A poem's id from the address: only the ids this app makes can name a poem. */
  const poemId = (id: string): string | null => (SAFE_ID.test(id) && id !== '__proto__' ? id : null);
  const notFound = () => problem(404, 'gone', 'This poem was deleted somewhere else, so it was not saved. You can save it again as a new poem.');

  return {
    /** GET /api/poems?after=&limit=&full=1 — a page of the collection, as summaries or (full=1) whole poems. */
    list: (request: Request) =>
      handle(request, async poems => {
        const url = new URL(request.url);
        const page = pageRequestOf(url);
        return json(url.searchParams.get('full') === '1' ? await poems.list(page) : await poems.listSummaries(page));
      }),

    /** POST /api/poems — saves a new poem. 201 with the poem as stored. */
    create: (request: Request) =>
      handle(request, async poems => {
        const draft: PoemDraft = accept(validateDraft(await readJson(request, POEM_BODY_MAX)));
        return json(await poems.create(draft), 201);
      }),

    /** GET /api/poems/:id */
    get: (request: Request, id: string) =>
      handle(request, async poems => {
        const safe = poemId(id);
        const poem = safe ? await poems.get(safe) : null;
        return poem ? json(poem) : problem(404, 'gone', 'That poem is no longer in your collection.');
      }),

    /** PUT /api/poems/:id with `If-Match: <revision>` — saves over a poem that started from that revision. */
    update: (request: Request, id: string) =>
      handle(request, async poems => {
        const revision = revisionOfIfMatch(request.headers.get('if-match'));
        if (revision === 'missing') throw new RequestProblem(428, 'Say which revision this save started from (If-Match).');
        if (revision === 'invalid') throw new RequestProblem(400, 'The If-Match header is not a revision.');
        const draft: PoemDraft = accept(validateDraft(await readJson(request, POEM_BODY_MAX)));
        const safe = poemId(id);
        if (!safe) return notFound();
        return json(await poems.update(safe, draft, revision));
      }),

    /** DELETE /api/poems/:id — 204 whether or not the poem was there. */
    remove: (request: Request, id: string) =>
      handle(request, async poems => {
        const safe = poemId(id);
        if (safe) await poems.delete(safe);
        return noContent();
      }),

    /** DELETE /api/account — deletes the signed-in user's poems and then the user. 204. Nothing is deleted if it cannot all be. */
    deleteAccount: async (request: Request) => {
      try {
        const userId = await deps.authenticate(request);
        if (!deps.accounts?.canDelete()) throw new UnavailableError({ cause: new Error('Accounts cannot be deleted here') });
        await deps.accounts.deleteAccount(userId);
        return noContent();
      } catch (error) {
        return errorResponse(error);
      }
    },

    /** GET /api/collection/count */
    count: (request: Request) => handle(request, async poems => json({ count: await poems.count() })),

    /** POST /api/collection/lookup {ids} — those poems, whole. */
    lookup: (request: Request) =>
      handle(request, async poems => {
        const ids = accept(validateIds(await readJson(request, IMPORT_BODY_MAX)));
        return json({ poems: await poems.getMany(ids) });
      }),

    /** POST /api/collection/import {poems} — adds poems with their own ids, times and revisions (restoring a backup), all or none. */
    importPoems: (request: Request) =>
      handle(request, async poems => {
        const list = accept(validatePoems(await readJson(request, IMPORT_BODY_MAX)));
        await poems.importMany(list);
        return json({ added: list.length }, 201);
      }),
  };
}

export type PoemsApi = ReturnType<typeof createPoemsApi>;
