import { LIMITS, type Page, type PageRequest } from '@/lib/models';

/** The number of items a request asks for: its limit if it is a whole number, kept within 1..pageMax. */
export function pageSize(request: PageRequest | undefined): number {
  const limit = request?.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit)) return LIMITS.pageDefault;
  return Math.min(Math.max(limit, 1), LIMITS.pageMax);
}

/**
 * One page of `all` (already in its fixed order): the items after the one `idOf` names as `after`.
 * A cursor that names nothing in the list gives an empty last page, so a stale cursor ends a walk
 * instead of starting it over.
 */
export function pageOf<T>(all: readonly T[], idOf: (item: T) => string, request: PageRequest | undefined): Page<T> {
  const size = pageSize(request);
  let start = 0;
  if (request?.after !== undefined) {
    const at = all.findIndex(item => idOf(item) === request.after);
    if (at < 0) return { items: [], next: null };
    start = at + 1;
  }
  const items = all.slice(start, start + size);
  const last = items[items.length - 1];
  return { items, next: last !== undefined && start + size < all.length ? idOf(last) : null };
}

interface Dated {
  id: string;
  updatedAt: string;
}

const timeOf = (item: Dated) => Date.parse(item.updatedAt) || 0;

/** The order poems are listed in: the most recently changed first, and by id among those changed at the same moment. */
export function poemOrder(a: Dated, b: Dated): number {
  return timeOf(b) - timeOf(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Where a page of poems ended: the cursor to ask for the page after it. */
export function poemCursor(item: Dated): string {
  return `${item.updatedAt}|${item.id}`;
}

/**
 * One page of poems in poemOrder: those that come after the position the cursor names. The cursor is a
 * position, not an item, so it still works when the poem it came from has since been changed or
 * deleted, and a poem changed or added meanwhile is neither repeated nor lost from the pages after.
 * A cursor that is not a position ends the walk with an empty page.
 */
export function pageOfPoems<T extends Dated>(all: readonly T[], request: PageRequest | undefined): Page<T> {
  const size = pageSize(request);
  let rest = [...all].sort(poemOrder);
  if (request?.after !== undefined) {
    const bar = request.after.indexOf('|');
    const position = { updatedAt: request.after.slice(0, bar), id: request.after.slice(bar + 1) };
    if (bar < 0 || Number.isNaN(Date.parse(position.updatedAt)) || position.id === '') return { items: [], next: null };
    rest = rest.filter(item => poemOrder(item, position) > 0);
  }
  const items = rest.slice(0, size);
  return { items, next: rest.length > size ? poemCursor(items[items.length - 1]) : null };
}
