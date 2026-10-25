// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { layoutPageDnaBlocks, type PageDna, type PageDnaBlock } from '@/lib/search/found';
import { PageDnaStrip } from '@/components/PageDnaStrip';
import type { PageDnaState } from '@/components/usePageDna';
import { render } from '../helpers/react';
import golden from '../fixtures/found-families.json';

const block = (id: string, start: number, end: number, variants = 0, words = 100): PageDnaBlock => ({
  familyId: id,
  startWord: start,
  endWord: end,
  startFraction: start / words,
  endFraction: (end + 1) / words,
  variants,
});

describe('layoutPageDnaBlocks', () => {
  it('keeps blocks that do not touch in one row', () => {
    const { placed, rows } = layoutPageDnaBlocks([block('a', 0, 9), block('b', 20, 29), block('c', 50, 59)]);
    expect(placed.map(p => p.row)).toEqual([0, 0, 0]);
    expect(rows).toBe(1);
  });

  it('puts a block that overlaps the previous one in the next row, and reuses a row once it is free', () => {
    // a: 0-19, b: 10-29 overlaps a -> row 1; c: 20-39 starts as a ends (row 0 is free again).
    const { placed, rows } = layoutPageDnaBlocks([block('a', 0, 19), block('b', 10, 29), block('c', 20, 39)]);
    expect(placed.map(p => p.row)).toEqual([0, 1, 0]);
    expect(rows).toBe(2);
  });

  it('treats blocks that merely touch (one ends where the next starts) as not overlapping', () => {
    // a covers words 0-9, so ends at fraction 10/100; b starts at word 10 -> fraction 10/100.
    const { placed } = layoutPageDnaBlocks([block('a', 0, 9), block('b', 10, 19)]);
    expect(placed.map(p => p.row)).toEqual([0, 0]);
  });

  it('needs three rows when three blocks overlap at once, and has one row for no blocks', () => {
    expect(layoutPageDnaBlocks([block('a', 0, 29), block('b', 5, 34), block('c', 10, 39)]).rows).toBe(3);
    expect(layoutPageDnaBlocks([])).toEqual({ placed: [], rows: 1 });
  });

  it('keeps every block, in reading order', () => {
    const blocks = [block('a', 0, 19), block('b', 10, 29), block('c', 20, 39), block('d', 60, 79)];
    expect(layoutPageDnaBlocks(blocks).placed.map(p => p.block.familyId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lays out the real Walden strip in two rows, as worked out by hand', () => {
    // Representatives span words 14-28, 24-38, 33-47, 42-57, 57-68, 65-76, 89-105, 188-198, 196-208.
    // Greedy: 14-28 row 0; 24-38 overlaps -> row 1; 33-47 row 0 (free after 28); 42-57 row 1 (free
    // after 38); 57-68 row 0; 65-76 row 1; 89-105 row 0; 188-198 row 0; 196-208 overlaps -> row 1.
    const { placed, rows } = layoutPageDnaBlocks(golden['walden-woods'].pageDna.blocks);
    expect(placed.map(p => p.row)).toEqual([0, 1, 0, 1, 0, 1, 0, 0, 1]);
    expect(rows).toBe(2);
  });

  it.each(Object.keys(golden))('never lets two blocks in one row overlap (%s)', id => {
    const { placed } = layoutPageDnaBlocks(golden[id as keyof typeof golden].pageDna.blocks);
    for (const a of placed) {
      for (const b of placed) {
        if (a !== b && a.row === b.row) {
          const apart = a.block.endFraction <= b.block.startFraction || b.block.endFraction <= a.block.startFraction;
          expect(apart, `${a.block.familyId} / ${b.block.familyId}`).toBe(true);
        }
      }
    }
  });
});

describe('PageDnaStrip', () => {
  const pageDna = (overrides: Partial<PageDna> = {}): PageDna => ({
    poemsToFind: 3,
    per100Words: 4.23,
    wordsPerPoem: 24,
    blocks: [block('p-family-0001', 1, 17, 0), block('p-family-0030', 30, 46, 3), block('p-family-0070', 70, 86, 8)],
    ...overrides,
  });
  const show = (state: PageDnaState) => render(createElement(PageDnaStrip, { state }));
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('says how many poems there are to find in plain words, and how often', () => {
    const { container } = show({ status: 'ready', pageDna: pageDna() });
    expect(text(container)).toContain('Page DNA');
    expect(text(container)).toContain('3 poems to find');
    expect(text(container)).toContain('about one every 24 words');
    expect(text(container)).not.toMatch(/hidden/i);
  });

  it('keeps the per-100-words figure out of the visible text and in a hover detail', () => {
    const { container } = show({ status: 'ready', pageDna: pageDna() });
    expect(text(container)).not.toContain('4.23');
    expect(text(container)).not.toMatch(/100/);
    const hover = container.querySelector('[title]')!.getAttribute('title')!;
    expect(hover).toContain('4.23 per 100 words');
    expect(hover).toMatch(/each block is a poem to find/i);
  });

  it('uses the singular for a single poem', () => {
    const { container } = show({
      status: 'ready',
      pageDna: pageDna({ poemsToFind: 1, wordsPerPoem: 1, blocks: [block('p-family-0001', 1, 17)] }),
    });
    expect(text(container)).toContain('1 poem to find');
    expect(text(container)).not.toContain('poems to find');
    expect(text(container)).toContain('about one every 1 word');
  });

  it('keeps the spoken description singular for one word too', () => {
    const { container } = show({
      status: 'ready',
      pageDna: pageDna({ poemsToFind: 1, wordsPerPoem: 1, blocks: [block('p-family-0001', 1, 17)] }),
    });
    expect(container.querySelector('[role=img]')!.getAttribute('aria-label')).toBe(
      'Page DNA strip. 1 poem to find, about one every 1 word.'
    );
  });

  it('draws one block per poem, at its place in the passage', () => {
    const { container } = show({ status: 'ready', pageDna: pageDna() });
    const blocks = [...container.querySelectorAll<HTMLElement>('[data-poem]')];
    expect(blocks.map(b => b.dataset.poem)).toEqual(['p-family-0001', 'p-family-0030', 'p-family-0070']);
    expect(blocks.map(b => b.style.left)).toEqual(['1%', '30%', '70%']);
    expect(blocks.map(b => b.style.width)).toEqual(['17%', '17%', '17%']);
  });

  it('makes a poem with more variants darker', () => {
    const { container } = show({ status: 'ready', pageDna: pageDna() });
    const opacity = [...container.querySelectorAll<HTMLElement>('[data-poem]')].map(b => Number(b.style.opacity));
    expect(opacity[0]).toBeCloseTo(0.5); // no variants
    expect(opacity[1]).toBeGreaterThan(opacity[0]);
    expect(opacity[2]).toBeGreaterThan(opacity[1]);
    expect(Math.max(...opacity)).toBeLessThanOrEqual(1);
  });

  it('draws overlapping poems on separate rows so they do not merge into one dark patch', () => {
    const { container } = show({
      status: 'ready',
      pageDna: pageDna({ blocks: [block('a', 0, 19), block('b', 10, 29), block('c', 40, 59)], poemsToFind: 3 }),
    });
    const [a, b, c] = [...container.querySelectorAll<HTMLElement>('[data-poem]')];
    expect(a.style.top).not.toBe(b.style.top); // overlap -> different rows
    expect(a.style.top).toBe(c.style.top); // no overlap -> same row
  });

  it('describes the strip to assistive technology, without the hover number', () => {
    const { container } = show({ status: 'ready', pageDna: pageDna() });
    const strip = container.querySelector('[role=img]')!;
    expect(strip.getAttribute('aria-label')).toBe('Page DNA strip. 3 poems to find, about one every 24 words.');
  });

  it('says so, with an empty strip, when there is nothing to find', () => {
    const { container } = show({
      status: 'ready',
      pageDna: { poemsToFind: 0, per100Words: 0, wordsPerPoem: null, blocks: [] },
    });
    expect(text(container)).toContain('No poems to find here');
    expect(text(container)).not.toContain('about one every');
    expect(container.querySelectorAll('[data-poem]')).toHaveLength(0);
    expect(container.querySelector('[role=img]')!.getAttribute('aria-label')).toContain('No poems to find');
  });

  it('shows that it is looking while the answer is worked out, with no blocks', () => {
    const { container } = show({ status: 'loading' });
    expect(text(container)).toContain('Looking for poems');
    expect(container.querySelectorAll('[data-poem]')).toHaveLength(0);
    expect(container.querySelector('[aria-busy=true]')).not.toBeNull();
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('says honestly when it could not work it out', () => {
    const { container } = show({ status: 'unavailable' });
    expect(text(container)).toContain('unavailable');
    expect(container.querySelectorAll('[data-poem]')).toHaveLength(0);
  });
});
