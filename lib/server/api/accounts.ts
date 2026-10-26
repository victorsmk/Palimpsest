import { UnavailableError } from '@/lib/models';
import type { Db } from '../db';

/** What deleting an account takes: everything the user stored, and then the sign-in itself. */
export interface AccountStore {
  deleteAccount(userId: string): Promise<void>;
  /** Whether it can do the whole job. When it cannot, nothing is deleted at all. */
  canDelete(): boolean;
}

export interface AccountStoreOptions {
  db: Db;
  /** Supabase's admin address and secret key, for removing the user. Absent in tests, where there is no such user. */
  supabase?: { url: string; serviceRoleKey: string; fetch?: typeof fetch };
  /** True when there is no Supabase user to remove (the test sign-in). */
  noAuthUser?: boolean;
}

/**
 * Deletes an account: the user's poems first, so the data is gone even if the next step fails, and then
 * the user at Supabase (its admin API, with the secret key that must only ever be on the server).
 * Doing it again after a failure is safe: deleting what is gone is not an error. A user Supabase no
 * longer has counts as deleted.
 */
export function createAccountStore(options: AccountStoreOptions): AccountStore {
  const canDelete = () => Boolean(options.noAuthUser || options.supabase);
  return {
    canDelete,
    async deleteAccount(userId) {
      if (!canDelete()) throw new UnavailableError({ cause: new Error('Deleting accounts needs SUPABASE_SERVICE_ROLE_KEY') });
      try {
        await options.db.query('delete from poems where user_id = $1', [userId]);
      } catch (cause) {
        throw new UnavailableError({ cause });
      }
      if (options.noAuthUser || !options.supabase) return;

      const { url, serviceRoleKey } = options.supabase;
      let response: Response;
      try {
        response = await (options.supabase.fetch ?? fetch)(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
          cache: 'no-store',
        });
      } catch (cause) {
        throw new UnavailableError({ cause });
      }
      if (!response.ok && response.status !== 404) {
        throw new UnavailableError({ cause: new Error(`Supabase answered ${response.status} to the deletion of a user`) });
      }
    },
  };
}
