import { ConfigError } from './config';
import {
  OfflineError,
  PoemConflictError,
  PoemExistsError,
  PoemGoneError,
  PoemLimitError,
  RateLimitedError,
  RepositoryError,
  StorageError,
  UnauthorizedError,
  UnavailableError,
  type Poem,
} from '@/lib/models';

/**
 * How the API speaks. Every response is JSON and is never cached. An error is
 * `{ "error": { "code", "message" } }`, and a conflict also carries the poem as it is stored now
 * (`current`). The code is a RepositoryError's code, or "invalid" for a request the server cannot use.
 * The HTTP repository in the browser turns these back into the same typed errors.
 */
export interface ErrorBody {
  error: { code: string; message: string; current?: Poem };
}

const BASE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: BASE_HEADERS });
}

export function problem(status: number, code: string, message: string, extra: Partial<ErrorBody['error']> = {}, headers: Record<string, string> = {}): Response {
  const body: ErrorBody = { error: { code, message, ...extra } };
  return json(body, status, headers);
}

/** A request the server cannot use (bad shape, wrong type, too large). `code` is "invalid" for the client. */
export class RequestProblem extends Error {
  constructor(
    readonly status: 400 | 409 | 413 | 415 | 422 | 428,
    message: string
  ) {
    super(message);
  }
}

const UNEXPECTED = 'The server could not do that. Please try again.';

/** The response for anything that went wrong while handling a request. */
export function errorResponse(error: unknown): Response {
  if (error instanceof RequestProblem) {
    return problem(error.status, error.status === 422 ? 'limit' : error.status === 409 ? 'exists' : 'invalid', error.message);
  }
  if (error instanceof UnauthorizedError) return problem(401, error.code, error.message, {}, { 'WWW-Authenticate': 'Bearer' });
  if (error instanceof PoemConflictError) return problem(409, error.code, error.message, { current: error.current });
  if (error instanceof PoemGoneError) return problem(404, error.code, error.message);
  if (error instanceof PoemExistsError) return problem(409, error.code, error.message);
  if (error instanceof PoemLimitError) return problem(422, error.code, error.message);
  if (error instanceof RateLimitedError) return problem(429, error.code, error.message, {}, { 'Retry-After': String(error.retryAfterSeconds) });
  if (error instanceof UnavailableError || error instanceof OfflineError || error instanceof StorageError) {
    console.error('The server could not reach its data:', error instanceof ConfigError ? error.problem : (error.cause ?? error));
    return problem(503, 'unavailable', 'The server could not be reached.');
  }
  if (error instanceof RepositoryError) return problem(500, error.code, UNEXPECTED);
  console.error('Unexpected error in the poems API:', error);
  return problem(500, 'unavailable', UNEXPECTED);
}
