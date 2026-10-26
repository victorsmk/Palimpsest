import { describe, it, expect } from 'vitest';
import { FOLD_PAIRS, fold, searchTerms, sortTitle } from '@/lib/library/fold';

// Searching ignores capitals and accents. The same folding is done to the books' names inside the database,
// so these pin down the letters it covers.

describe('folding a text', () => {
  it('makes capitals small and takes accents off letters', () => {
    expect(fold('Charlotte BRONTË')).toBe('charlotte bronte');
    expect(fold('Émile Zola')).toBe('emile zola');
    expect(fold('Gabriel García Márquez')).toBe('gabriel garcia marquez');
    expect(fold('Čapek, Dvořák, Łukasiewicz')).toBe('capek, dvorak, lukasiewicz');
  });

  it('folds the letters that have no accent to take off', () => {
    expect(fold('Ørsted ß Đ æ Œ Þ')).toBe('orsted s d a o t');
  });

  it('leaves everything else as it is', () => {
    expect(fold("Alice's Adventures, 1865 — the end.")).toBe("alice's adventures, 1865 — the end.");
  });
});

describe('the pairs given to the database', () => {
  it('are as long on both sides, and each is a letter that folds to a different single letter', () => {
    expect([...FOLD_PAIRS.from]).toHaveLength([...FOLD_PAIRS.to].length);
    [...FOLD_PAIRS.from].forEach((letter, i) => {
      expect(fold(letter)).toBe([...FOLD_PAIRS.to][i]);
      expect(fold(letter)).not.toBe(letter);
    });
  });

  it('cover capitals and small letters, with and without accents', () => {
    for (const letter of ['ë', 'Ë', 'é', 'É', 'ñ', 'Ñ', 'ø', 'Ø', 'ł', 'Ł', 'ž', 'Ž', 'ő', 'Ő']) expect(FOLD_PAIRS.from).toContain(letter);
  });

  it('give the same answer as fold for a whole name, when applied letter by letter as translate does', () => {
    const translate = (text: string) => [...text].map(c => { const at = [...FOLD_PAIRS.from].indexOf(c); return at >= 0 ? [...FOLD_PAIRS.to][at] : c; }).join('').toLowerCase();
    for (const name of ['Charlotte Brontë', 'ÉMILE ZOLA', 'Gabriel García Márquez', 'Øystein Łukasiewicz']) expect(translate(name)).toBe(fold(name));
  });
});

describe('the words of a search', () => {
  it('are folded and split on spaces', () => {
    expect(searchTerms('  Jane   BRONTË ')).toEqual(['jane', 'bronte']);
  });

  it('are at most eight, and each at most sixty characters', () => {
    expect(searchTerms('a b c d e f g h i j k')).toHaveLength(8);
    expect(searchTerms('x'.repeat(200))[0]).toHaveLength(60);
  });

  it('are none for an empty search', () => {
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('the title that books are put in order by', () => {
  it('leaves off a leading The, A or An, and nothing else', () => {
    expect(sortTitle('The Picture of Dorian Gray')).toBe('picture of dorian gray');
    expect(sortTitle('A Tale of Two Cities')).toBe('tale of two cities');
    expect(sortTitle('An Inquiry')).toBe('inquiry');
    expect(sortTitle('Theory of Everything')).toBe('theory of everything');
    expect(sortTitle('Anna Karenina')).toBe('anna karenina');
    expect(sortTitle('Walden')).toBe('walden');
  });
});
