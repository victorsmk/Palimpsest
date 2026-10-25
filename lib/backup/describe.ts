import type { RestorePlan } from './backup';

const poems = (n: number) => `${n} ${n === 1 ? 'poem' : 'poems'}`;

export interface RestoreSummary {
  /** "This backup has 5 poems." */
  headline: string;
  /** What will and will not happen to them, one plain sentence each. */
  details: string[];
}

/**
 * Says in plain words what a restore would do, for the question asked before it happens.
 * `entries` is every poem the file lists; `unreadable` and `repeated` are the ones it cannot use.
 */
export function describeRestore(entries: number, plan: RestorePlan, unreadable: number, repeated: number): RestoreSummary {
  const details: string[] = [];
  const add = plan.toAdd.length;
  if (add > 0) details.push(`${add} ${add === 1 ? 'is' : 'are'} new and will be added.`);
  if (plan.alreadyHere > 0) {
    details.push(`${plan.alreadyHere} ${plan.alreadyHere === 1 ? 'is' : 'are'} already in your collection.`);
  }
  if (plan.differentKept > 0) {
    details.push(
      plan.differentKept === 1
        ? '1 is a different version of a poem you already have, so yours is kept.'
        : `${plan.differentKept} are different versions of poems you already have, so yours are kept.`
    );
  }
  if (unreadable > 0) details.push(`${unreadable} can't be read and will be skipped.`);
  if (repeated > 0) details.push(`${repeated} ${repeated === 1 ? 'is' : 'are'} repeated in the file and will be skipped.`);
  return { headline: `This backup has ${poems(entries)}.`, details };
}
