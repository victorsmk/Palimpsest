import { RateLimitedError } from '@/lib/models';
import type { Db } from '../db';

/** One kind of request, and how many of it one user may make in a window of time. */
export interface RateLimit {
  bucket: string;
  limit: number;
  windowMs: number;
}

/**
 * What a signed-in user may do. Reading is generous (a page loads several lists); writing is not; deleting
 * an account is a rare act, and each try calls Supabase.
 */
export const RATE_LIMITS = {
  read: { bucket: 'read', limit: 300, windowMs: 60_000 },
  write: { bucket: 'write', limit: 60, windowMs: 60_000 },
  account: { bucket: 'account', limit: 5, windowMs: 3_600_000 },
} as const satisfies Record<string, RateLimit>;

export interface RateLimiter {
  /** Counts one request by `subject` against `rule`; throws RateLimitedError when it is over. */
  check(rule: RateLimit, subject: string): Promise<void>;
}

/** Counters older than this are of no use (the longest window is an hour) and are removed now and then. */
const KEEP_MS = 2 * 24 * 3_600_000;
const CLEAN_ONE_IN = 200;

export interface DbRateLimiterOptions {
  now?: () => number;
  /** For tests: a number from 0 up to (not including) 1. */
  random?: () => number;
}

/**
 * Counts in the database, because the server runs as many separate instances that share no memory. A
 * counter is one row per kind of request and user, for a fixed window of time: the first request of a new
 * window starts it again at one. One statement does the counting, so two requests at the same moment are
 * both counted. If the database cannot count (it is down, or the table was never made), the request is let
 * through and the problem is logged: this guards against heavy use, and must not be the thing that stops
 * the site when something else is wrong (the health page says when the table is missing).
 */
export function createDbRateLimiter(db: Db, options: DbRateLimiterOptions = {}): RateLimiter {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  return {
    async check(rule, subject) {
      const at = now();
      const windowStart = at - (at % rule.windowMs);
      let hits: number;
      try {
        const { rows } = await db.query<{ hits: number }>(
          `insert into rate_limits as r (bucket, subject, window_start, hits)
           values ($1, $2, $3, 1)
           on conflict (bucket, subject) do update set
             hits = case when excluded.window_start > r.window_start then 1 else r.hits + 1 end,
             window_start = greatest(r.window_start, excluded.window_start)
           returning hits`,
          [rule.bucket, subject, windowStart]
        );
        hits = Number(rows[0].hits);
      } catch (error) {
        console.error('Rate limiting could not count a request, so it was let through:', error);
        return;
      }
      if (random() < 1 / CLEAN_ONE_IN) {
        try {
          await db.query('delete from rate_limits where window_start < $1', [at - KEEP_MS]);
        } catch (error) {
          console.error('Rate limiting could not remove old counters:', error);
        }
      }
      if (hits > rule.limit) throw new RateLimitedError(Math.max(1, Math.ceil((windowStart + rule.windowMs - at) / 1000)));
    },
  };
}
