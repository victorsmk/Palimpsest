import {
  OfflineError,
  PoemConflictError,
  PoemExistsError,
  PoemGoneError,
  PoemLimitError,
  RateLimitedError,
  UnauthorizedError,
  UnavailableError,
} from '@/lib/models';
import { parsePoem } from '@/lib/models/poemValidation';
import type { SessionSource } from '@/lib/auth/session';

export interface ApiClientOptions {
  /** Who is signed in; the token is sent with every request. With nobody, nothing is sent at all. */
  session: SessionSource;
  /** Where the API is. Empty means this site, which is what the app uses. */
  baseUrl?: string;
  /** For tests. */
  fetch?: typeof fetch;
}

/** The kinds of answer the API gives for a mistake of the client's own: nothing a writer can act on. */
export class BadRequest extends Error {}

/**
 * Sends requests to the API as the signed-in user and turns every failure into a typed error: not
 * signed in, a conflict (with the poem as stored), gone, already stored, a limit (in the server's own
 * words), rate limited, and offline or unavailable when the server cannot be reached or does not make
 * sense. What to do with a success is left to the caller.
 */
export class ApiClient {
  private session: SessionSource;
  private baseUrl: string;
  private doFetch: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.session = options.session;
    this.baseUrl = options.baseUrl ?? '';
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  /** Sends a request and returns the answer if it was a success; otherwise throws the matching error. */
  async send(method: string, path: string, options: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
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
  async read(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new UnavailableError({ cause });
    }
  }
}
