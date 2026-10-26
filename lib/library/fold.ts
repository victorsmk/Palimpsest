/**
 * Searching books by title and author ignores capitals and accents: "bronte" finds Brontë, "DICKENS" finds
 * Dickens. `fold` is what both the search words and the books' names are put through. The database does the
 * same to the books with `translate` and the pairs below, so the two sides cannot disagree (it avoids
 * depending on a database extension, or on the database's idea of capitals in its language setting).
 */

/** Letters that do not come apart into a plain letter and an accent. */
const OTHER: Record<string, string> = { ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ł: 'l', Ł: 'l', ß: 's', ð: 'd', Ð: 'd', þ: 't', Þ: 't', ı: 'i', æ: 'a', Æ: 'a', œ: 'o', Œ: 'o' };

/** A text with capitals made small and accents taken off its letters. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øØđĐłŁßðÐþÞıæÆœŒ]/g, letter => OTHER[letter])
    .toLowerCase();
}

/**
 * The letters with accents (Latin-1 and Latin Extended-A and -B) that fold to one different letter, and
 * the letters they fold to, for the database's `translate(text, from, to)`. Capitals are in the list too:
 * the database's `lower` may not change letters outside ASCII.
 */
export const FOLD_PAIRS: { from: string; to: string } = (() => {
  let from = '';
  let to = '';
  for (let code = 0x00c0; code <= 0x024f; code++) {
    const letter = String.fromCodePoint(code);
    const folded = fold(letter);
    if (folded.length === 1 && folded !== letter) {
      from += letter;
      to += folded;
    }
  }
  return { from, to };
})();

/** The words of a search, folded: at most eight, each at most 60 characters. */
export function searchTerms(search: string): string[] {
  return fold(search)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map(term => term.slice(0, 60));
}

/** The title with a leading "The", "A" or "An" taken off, to put books in order by their first real word. */
export function sortTitle(title: string): string {
  return fold(title).replace(/^(?:the|a|an)\s+/, '');
}
