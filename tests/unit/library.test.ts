import { describe, it, expect } from 'vitest';
import { bundledPassages } from '@/lib/library/bundled';
import { BookService, PageDnaService, bookService } from '@/lib/services';
import { BrowserBookRepository } from '@/lib/repositories';
import { tokenize } from '@/lib/tokenizer';
import type { Passage } from '@/lib/models';

describe('bundled library', () => {
  it('ships the three curated passages in display order', () => {
    expect(bundledPassages.map(p => p.id)).toEqual([
      'jane-eyre-ch1',
      'walden-woods',
      'dorian-gray-ch1',
    ]);
  });

  it('keeps source text, attribution and tokens consistent for every passage', () => {
    for (const passage of bundledPassages) {
      expect(passage.sourceText.length).toBeGreaterThan(0);
      expect(passage.attribution.source).toBe('Project Gutenberg');
      expect(passage.attribution.url).toMatch(/^https:\/\/www\.gutenberg\.org\/ebooks\/\d+$/);
      expect(passage.attribution.licenseNote).not.toBe('');

      // Tokens are derived from the immutable source text, with IDs namespaced by passage.
      expect(passage.tokens).toEqual(tokenize(passage.id, passage.sourceText));
      expect(passage.tokens.every(t => t.id.startsWith(`${passage.id}-token-`))).toBe(true);
    }
  });

  it('uses passages of roughly 150-300 words, as the spec asks', () => {
    for (const passage of bundledPassages) {
      const words = passage.tokens.filter(t => t.isSelectable).length;
      expect(words, passage.id).toBeGreaterThanOrEqual(150);
      expect(words, passage.id).toBeLessThanOrEqual(300);
    }
  });
});

describe('BookService', () => {
  const make = (id: string, bookId: string): Passage => ({
    id,
    bookId,
    title: id,
    description: '',
    sourceText: 'one two',
    tokens: tokenize(id, 'one two'),
    attribution: {
      title: bookId,
      author: 'A',
      year: 1900,
      source: 'Project Gutenberg',
      url: 'https://www.gutenberg.org/ebooks/1',
      licenseNote: 'Public domain in the USA',
    },
  });

  it('lists every passage across books, grouped by book', async () => {
    const service = new BookService(
      new BrowserBookRepository([make('a1', 'book-a'), make('b1', 'book-b'), make('a2', 'book-a')])
    );
    expect((await service.listPassages()).map(p => p.id)).toEqual(['a1', 'a2', 'b1']);
    expect((await service.listBooks()).map(b => b.id)).toEqual(['book-a', 'book-b']);
  });

  it('returns null for an unknown passage', async () => {
    const service = new BookService(new BrowserBookRepository([make('a1', 'book-a')]));
    expect(await service.getPassage('missing')).toBeNull();
    expect((await service.getPassage('a1'))?.id).toBe('a1');
  });

  it('serves the bundled library by default', async () => {
    const passages = await bookService.listPassages();
    expect(passages.map(p => p.id)).toEqual(bundledPassages.map(p => p.id));
  });
});

describe('PageDnaService', () => {
  // The Studio used to hard-code these; they are now computed, and must still agree.
  const expected: Record<string, number> = {
    'jane-eyre-ch1': 18.99,
    'walden-woods': 40.85,
    'dorian-gray-ch1': 15.66,
  };

  it('computes the same Page DNA the Studio used to hard-code', async () => {
    const service = new PageDnaService();
    for (const passage of bundledPassages) {
      expect(await service.getPageDNA(passage), passage.id).toBe(expected[passage.id]);
    }
  });

  it('caches per passage', () => {
    const service = new PageDnaService();
    const [first, second] = bundledPassages;
    expect(service.getPageDNA(first)).toBe(service.getPageDNA(first));
    expect(service.getPageDNA(first)).not.toBe(service.getPageDNA(second));
  });

  it('is zero for a passage with no words', async () => {
    const service = new PageDnaService();
    expect(await service.getPageDNA({ id: 'empty', tokens: [] })).toBe(0);
  });
});
