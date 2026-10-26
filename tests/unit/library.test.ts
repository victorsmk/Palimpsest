import { describe, it, expect } from 'vitest';
import { bundledPassages } from '@/lib/library/bundled';
import { BookService, FoundService, bookService } from '@/lib/services';
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

  it('lists every passage of the library as a summary, in the library order', async () => {
    const service = new BookService(
      new BrowserBookRepository([make('a1', 'book-a'), make('b1', 'book-b'), make('a2', 'book-a')])
    );
    expect((await service.listPassageSummaries()).map(p => p.id)).toEqual(['a1', 'b1', 'a2']);
    expect((await service.listBooks()).map(b => b.id)).toEqual(['book-a', 'book-b']);
  });

  it('returns null for an unknown passage', async () => {
    const service = new BookService(new BrowserBookRepository([make('a1', 'book-a')]));
    expect(await service.getPassage('missing')).toBeNull();
    expect((await service.getPassage('a1'))?.id).toBe('a1');
  });

  it('serves the bundled library by default', async () => {
    const passages = await bookService.listPassageSummaries();
    expect(passages.map(p => p.id)).toEqual(bundledPassages.map(p => p.id));
  });
});

describe('FoundService', () => {
  // Poems to find per passage (weak line endings hidden, overlapping windows grouped).
  const expected: Record<string, { poemsToFind: number; wordsPerPoem: number; per100Words: number }> = {
    'jane-eyre-ch1': { poemsToFind: 8, wordsPerPoem: 30, per100Words: 3.38 },
    'walden-woods': { poemsToFind: 9, wordsPerPoem: 24, per100Words: 4.23 },
    'dorian-gray-ch1': { poemsToFind: 7, wordsPerPoem: 28, per100Words: 3.54 },
  };

  it('works out the poems to find in each passage', async () => {
    const service = new FoundService();
    for (const passage of bundledPassages) {
      const { families, pageDna } = await service.analyze(passage);
      expect(pageDna, passage.id).toMatchObject(expected[passage.id]);
      expect(pageDna.blocks, passage.id).toHaveLength(expected[passage.id].poemsToFind);
      expect(families, passage.id).toHaveLength(expected[passage.id].poemsToFind);
    }
  });

  it('caches per passage, so the Studio and Discover share one search', () => {
    const service = new FoundService();
    const [first, second] = bundledPassages;
    expect(service.analyze(first)).toBe(service.analyze(first));
    expect(service.analyze(first)).not.toBe(service.analyze(second));
  });

  it('has nothing to find in a passage with no words', async () => {
    const service = new FoundService();
    const analysis = await service.analyze({ id: 'empty', tokens: [] });
    expect(analysis.families).toEqual([]);
    expect(analysis.pageDna).toEqual({ poemsToFind: 0, per100Words: 0, wordsPerPoem: null, blocks: [] });
  });
});
