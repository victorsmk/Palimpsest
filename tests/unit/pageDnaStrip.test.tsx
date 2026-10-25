// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { layoutPageDnaBlocks, type PageDna, type PageDnaBlock } from '@/lib/search/found';
import { PageDnaStrip, PageDnaTrack } from '@/components/PageDnaStrip';
import type { PageDnaState } from '@/components/usePageDna';
import { render } from '../helpers/react';
import golden from '../fixtures/found-families.json';

// next/link needs the App Router; here it is just an anchor.
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      h('a', { href, ...rest }, children),
  };
});

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

describe('layoutPageDnaBlocks with a minimum width', () => {
  // Blocks are fractions of a 100-word passage: 'a' 0-9 is 0.00-0.10.
  it('draws blocks at their true size when no minimum is asked for', () => {
    const { placed } = layoutPageDnaBlocks([block('a', 0, 9), block('b', 15, 24)]);
    expect(placed.map(p => [p.start, p.end])).toEqual([[0, 0.1], [0.15, 0.25]]);
  });

  it('widens a block that is narrower than the minimum, keeping its start', () => {
    const { placed } = layoutPageDnaBlocks([block('a', 0, 4)], 0.2); // 0.00-0.05 -> 0.00-0.20
    expect(placed[0].start).toBe(0);
    expect(placed[0].end).toBeCloseTo(0.2);
  });

  it('never narrows a block that is already wide enough', () => {
    const { placed } = layoutPageDnaBlocks([block('a', 10, 59)], 0.2); // 0.10-0.60
    expect([placed[0].start, placed[0].end]).toEqual([0.1, 0.6]);
  });

  it('works out the rows from the widened blocks, so nothing overlaps', () => {
    // True blocks 0.00-0.10 and 0.15-0.25 do not touch (one row). Widened to 0.20 the first reaches
    // 0.20, past the second's start at 0.15, so the second needs its own row.
    expect(layoutPageDnaBlocks([block('a', 0, 9), block('b', 15, 24)]).rows).toBe(1);
    const widened = layoutPageDnaBlocks([block('a', 0, 9), block('b', 15, 24)], 0.2);
    expect(widened.placed.map(p => p.row)).toEqual([0, 1]);
    expect(widened.rows).toBe(2);
  });

  it('slides a widened block left instead of letting it run off the end of the strip', () => {
    const { placed } = layoutPageDnaBlocks([block('z', 95, 99)], 0.2); // 0.95-1.00 -> 0.80-1.00
    expect(placed[0].start).toBeCloseTo(0.8);
    expect(placed[0].end).toBeCloseTo(1);
  });

  it('caps a minimum larger than the whole strip at the strip', () => {
    const { placed } = layoutPageDnaBlocks([block('a', 10, 19)], 5);
    expect([placed[0].start, placed[0].end]).toEqual([0, 1]);
  });

  it('keeps no two blocks of a row overlapping, however wide the minimum', () => {
    const blocks = [block('a', 2, 8), block('b', 12, 20), block('c', 25, 30), block('d', 33, 40), block('e', 70, 74), block('f', 90, 99)];
    for (const minimum of [0, 0.05, 0.1, 0.25, 0.5]) {
      const { placed } = layoutPageDnaBlocks(blocks, minimum);
      for (const a of placed) {
        for (const b of placed) {
          if (a !== b && a.row === b.row) {
            expect(a.end <= b.start + 1e-9 || b.end <= a.start + 1e-9, `min ${minimum}: ${a.block.familyId}/${b.block.familyId}`).toBe(true);
          }
        }
        expect(a.end - a.start).toBeGreaterThanOrEqual(Math.min(1, minimum) - 1e-9);
        expect(a.start).toBeGreaterThanOrEqual(-1e-9);
        expect(a.end).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('PageDnaTrack minimum block size', () => {
  afterEach(() => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  });

  /** A browser that reports the strip as `width` pixels wide as soon as it is watched. */
  const stripIsPixelsWide = (width: number) => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() {
        this.callback([{ contentRect: { width } }]);
      }
      disconnect() {}
    };
  };
  const track = (blocks: PageDnaBlock[], minBlockPx?: number) =>
    render(
      createElement(PageDnaTrack, { blocks, description: 'strip', height: 60, minBlockPx, onSelectPoem: () => {} })
    );
  const widths = (container: Element) => [...container.querySelectorAll<HTMLElement>('[data-poem]')].map(b => b.style.width);

  it('widens blocks that would be narrower than the minimum on a narrow strip', () => {
    stripIsPixelsWide(300); // 24px plus half a pixel of headroom, of 300px, is 8.167%
    const { container } = track([block('a', 0, 4), block('b', 50, 79)], 24); // 5% and 30% wide
    expect(widths(container)).toEqual(['8.167%', '30%']);
    for (const width of widths(container)) expect((parseFloat(width) / 100) * 300).toBeGreaterThanOrEqual(24);
  });

  it('leaves blocks at their true size on a strip wide enough, or when no minimum is set', () => {
    stripIsPixelsWide(1000); // 24px of 1000 is 2.4%
    expect(widths(track([block('a', 0, 4)], 24).container)).toEqual(['5%']);
    stripIsPixelsWide(300);
    expect(widths(track([block('a', 0, 4)]).container)).toEqual(['5%']);
  });

  it('makes the strip tall enough that every row of blocks is at least the minimum high', () => {
    stripIsPixelsWide(300);
    // Three blocks that overlap once widened to 8% need three rows: 4+4 padding, 3*24, 2*3 gaps = 86px.
    const { container } = track([block('a', 0, 4), block('b', 3, 7), block('c', 5, 9)], 24);
    const strip = container.querySelector<HTMLElement>('[role=group]')!;
    expect(strip.style.height).toBe('86px');
    for (const b of container.querySelectorAll<HTMLElement>('[data-poem]')) {
      expect(parseFloat(b.style.height)).toBeGreaterThanOrEqual(24);
    }
  });

  it('keeps the strip at the requested height when the rows already fit', () => {
    stripIsPixelsWide(300);
    const { container } = track([block('a', 0, 9), block('b', 50, 59)], 24);
    expect(container.querySelector<HTMLElement>('[role=group]')!.style.height).toBe('60px');
  });

  it('copes with a browser that has no size observer', () => {
    const { container } = track([block('a', 0, 4)], 24);
    expect(widths(container)).toEqual(['5%']); // true size until it can measure
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

  it('shows no per-100-words figure and no hover box', () => {
    const { container } = show({ status: 'ready', pageDna: pageDna() });
    expect(text(container)).not.toContain('4.23');
    expect(text(container)).not.toMatch(/100/);
    expect(container.querySelector('[title]')).toBeNull();
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

  describe('the link to Discover', () => {
    const showLinked = (state: PageDnaState) =>
      render(createElement(PageDnaStrip, { state, discoverHref: '/discover#passage=walden-woods' }));

    it('leads to the poems in this passage, when there are some to read', () => {
      const { container } = showLinked({ status: 'ready', pageDna: pageDna() });
      const link = container.querySelector('a')!;
      expect(link.getAttribute('href')).toBe('/discover#passage=walden-woods');
      expect(text(link)).toBe('Read these poems in Discover →');
    });

    it('is left out when nothing links to Discover, or there is nothing to read', () => {
      expect(show({ status: 'ready', pageDna: pageDna() }).container.querySelector('a')).toBeNull();
      expect(
        showLinked({ status: 'ready', pageDna: { poemsToFind: 0, per100Words: 0, wordsPerPoem: null, blocks: [] } })
          .container.querySelector('a')
      ).toBeNull();
      expect(showLinked({ status: 'loading' }).container.querySelector('a')).toBeNull();
      expect(showLinked({ status: 'unavailable' }).container.querySelector('a')).toBeNull();
    });
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
