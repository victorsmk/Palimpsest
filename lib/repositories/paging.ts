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
