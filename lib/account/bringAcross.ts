import { BrowserPoemRepository } from '@/lib/repositories';
import type { Poem } from '@/lib/models';
import type { PoemService } from '@/lib/services/PoemService';
import type { RestorePlan } from '@/lib/backup';

/** Every poem kept in this browser's own storage, whole (older ones read as the current kind). */
export async function localPoems(local: BrowserPoemRepository = new BrowserPoemRepository()): Promise<Poem[]> {
  const poems: Poem[] = [];
  let after: string | undefined;
  do {
    const page = await local.list({ after });
    poems.push(...page.items);
    after = page.next ?? undefined;
  } while (after !== undefined);
  return poems;
}

/** How many poems this browser's storage holds. */
export function localPoemCount(local: BrowserPoemRepository = new BrowserPoemRepository()): Promise<number> {
  return local.count();
}

/**
 * Adds the poems kept in this browser to the account `service` writes to. It is a restore: it only
 * adds, a poem the account already has is left as it is (so doing it twice adds nothing twice), and
 * nothing in this browser is changed or removed.
 */
export async function bringAcross(poems: Poem[], service: PoemService): Promise<RestorePlan> {
  return service.restoreBackup(poems);
}

const flagKey = (userId: string) => `palimpsest:bring-across:${userId}`;

/** Whether this person has already answered the offer to bring their poems across ("done" or "declined"). */
export function bringAcrossAnswered(userId: string, storage: Pick<Storage, 'getItem'> = window.localStorage): boolean {
  try {
    return storage.getItem(flagKey(userId)) !== null;
  } catch {
    return true; // if it cannot be remembered, do not pester
  }
}

/** Remembers the answer. */
export function rememberBringAcross(userId: string, answer: 'done' | 'declined', storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  try {
    storage.setItem(flagKey(userId), answer);
  } catch {
    /* it will be asked again; harmless */
  }
}
