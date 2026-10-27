import { UnavailableError } from '@/lib/models';
import type { Db } from '../db';

/** What deleting an account takes: everything the user stored, and then the sign-in itself. */
export interface AccountStore {
  deleteAccount(userId: string): Promise<void>;
  /** Whether it can do the whole job. When it cannot, nothing is deleted at all. */
  canDelete(): boolean;
}

/**
 * The headers for Supabase's admin calls. Supabase says its new secret keys (sb_secret_...) go in the
 * `apikey` header and not as a bearer, because they are not JWTs; the legacy service_role key is a JWT, and
 * keeps working both ways, so that one is sent as a bearer too.
 */
export function adminHeaders(key: string): Record<string, string> {
  const looksLikeJwt = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(key);
  return looksLikeJwt ? { Authorization: `Bearer ${key}`, apikey: key } : { apikey: key };
}

export interface AccountStoreOptions {
  db: Db;
  /** Supabase's admin address and secret key, for removing the user. Absent in tests, where there is no such user. */
  supabase?: { url: string; serviceRoleKey: string; fetch?: typeof fetch };
  /** True when there is no Supabase user to remove (the test sign-in). */
  noAuthUser?: boolean;
}

/**
 * Deletes an account: the user's poems and texts first, so the data is gone even if the next step fails, and then
 * the user at Supabase (its admin API, with the secret key that must only ever be on the server).
 * Doing it again after a failure is safe: deleting what is gone is not an error. A user Supabase no
 * longer has counts as deleted.
 */
export function createAccountStore(options: AccountStoreOptions): AccountStore {
  const canDelete = () => Boolean(options.noAuthUser || options.supabase);
  /** Once the account is gone, so are its request counters. If they cannot be removed that is no reason to fail (they are cleaned up in time). */
  const forgetCounters = (userId: string) => options.db.query('delete from rate_limits where subject = $1', [userId]).then(() => undefined, () => undefined);
  /** The texts the user added. A database made before they could be (no such table yet) has none to delete. */
  const forgetTexts = async (userId: string) => {
    try {
      await options.db.query('delete from user_texts where user_id = $1', [userId]);
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code ?? (error as { cause?: { code?: unknown } } | null)?.cause?.code;
      if (code !== '42P01') throw error;
    }
  };
  return {
    canDelete,
    async deleteAccount(userId) {
      if (!canDelete()) throw new UnavailableError({ cause: new Error('Deleting accounts needs SUPABASE_SECRET_KEY') });
      try {
        await options.db.query('delete from poems where user_id = $1', [userId]);
        await forgetTexts(userId);
      } catch (cause) {
        throw new UnavailableError({ cause });
      }
      if (options.noAuthUser || !options.supabase) return forgetCounters(userId);

      const { url, serviceRoleKey } = options.supabase;
      let response: Response;
      try {
        response = await (options.supabase.fetch ?? fetch)(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: adminHeaders(serviceRoleKey),
          cache: 'no-store',
        });
      } catch (cause) {
        throw new UnavailableError({ cause });
      }
      if (!response.ok && response.status !== 404) {
        throw new UnavailableError({ cause: new Error(`Supabase answered ${response.status} to the deletion of a user`) });
      }
      await forgetCounters(userId);
    },
  };
}
