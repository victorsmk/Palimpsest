import { checkInput, UserTextError, type UserTextInput } from '@/lib/userTexts/UserTexts';
import { isTextId } from '@/lib/userTexts/id';
import type { PostgresTextRepository } from '../PostgresTextRepository';
import type { Authenticator } from './auth';
import { accept, readJson } from './handlers';
import { RequestProblem, errorResponse, json, noContent, problem } from './http';
import { RATE_LIMITS, type RateLimiter } from './rateLimit';
import type { Checked } from './validate';

/** The largest body of a request that holds one text: 600,000 characters, some of them several bytes, and a little more. */
const TEXT_BODY_MAX = 3 * 1024 * 1024;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export interface TextsApiDeps {
  authenticate: Authenticator;
  /** The texts of one user. */
  textsOf(userId: string): PostgresTextRepository;
  limiter?: RateLimiter;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The words, title, author and form of a text, checked as the browser checks them (and refused, not repaired, if wrong). */
function validateInput(raw: Record<string, unknown>): Checked<UserTextInput> {
  const { title, author, form, text } = raw;
  if (typeof title !== 'string' || typeof author !== 'string' || typeof text !== 'string' || (form !== 'prose' && form !== 'verse')) {
    return { ok: false, status: 400, message: 'The text needs a title, an author, a form and its words.' };
  }
  try {
    return { ok: true, value: checkInput({ title, author, form, text }) };
  } catch (error) {
    if (error instanceof UserTextError) return { ok: false, status: 422, message: error.message };
    throw error;
  }
}

/** A time a browser copied along with a text: kept if it is a proper time that is not in the future, else it is the moment of the request. */
function copiedTime(value: unknown, now: Date): string | null {
  if (typeof value !== 'string' || !ISO_TIME.test(value)) return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at > now.getTime()) return null;
  return new Date(at).toISOString();
}

/**
 * The API for the texts a signed-in reader has added, as plain functions from a Request to a Response, in the way
 * of the poems API (lib/server/api/handlers.ts): find out who is asking, check what was sent, do it for that user only.
 * A text is only ever added with the id the browser made, so that the excerpts, and the poems made from them, keep
 * the ids they had; adding one that is there is a 409, and changing one that is gone is a 404. If two browsers change
 * the same text, the one that saves last wins.
 */
export function createTextsApi(deps: TextsApiDeps) {
  async function handle(request: Request, kind: 'read' | 'write', work: (texts: PostgresTextRepository) => Promise<Response>): Promise<Response> {
    try {
      const userId = await deps.authenticate(request);
      await deps.limiter?.check(RATE_LIMITS[kind], userId);
      return await work(deps.textsOf(userId));
    } catch (error) {
      return errorResponse(error);
    }
  }

  const textId = (id: string): string | null => (isTextId(id) ? id : null);

  return {
    /** GET /api/texts — all the texts, whole, the one changed last first. */
    list: (request: Request) => handle(request, 'read', async texts => json({ texts: await texts.list() })),

    /** POST /api/texts {id, title, author, form, text, createdAt?, updatedAt?} — adds a text. 201 with the text as stored. */
    create: (request: Request) =>
      handle(request, 'write', async texts => {
        const raw = await readJson(request, TEXT_BODY_MAX);
        if (!isRecord(raw)) throw new RequestProblem(400, 'The text must be an object.');
        const id = typeof raw.id === 'string' ? textId(raw.id) : null;
        if (!id) throw new RequestProblem(400, 'The text needs an id like the ones this app makes.');
        const input = accept(validateInput(raw));
        const now = new Date();
        const createdAt = copiedTime(raw.createdAt, now);
        const updatedAt = copiedTime(raw.updatedAt, now);
        const times = createdAt && updatedAt && createdAt <= updatedAt ? { createdAt, updatedAt } : undefined;
        return json(await texts.create(id, input, times), 201);
      }),

    /** PUT /api/texts/:id {title, author, form, text} — saves over a text. */
    update: (request: Request, id: string) =>
      handle(request, 'write', async texts => {
        const raw = await readJson(request, TEXT_BODY_MAX);
        if (!isRecord(raw)) throw new RequestProblem(400, 'The text must be an object.');
        const input = accept(validateInput(raw));
        const safe = textId(id);
        if (!safe) return problem(404, 'gone', 'This text was deleted somewhere else, so the change was not saved.');
        return json(await texts.update(safe, input));
      }),

    /** DELETE /api/texts/:id — 204 whether or not the text was there. */
    remove: (request: Request, id: string) =>
      handle(request, 'write', async texts => {
        const safe = textId(id);
        if (safe) await texts.delete(safe);
        return noContent();
      }),
  };
}

export type TextsApi = ReturnType<typeof createTextsApi>;
