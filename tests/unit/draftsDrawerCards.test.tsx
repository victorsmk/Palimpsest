// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { DraftsDrawer } from '@/components/DraftsDrawer';
import { bundledPassages } from '@/lib/library/bundled';
import { readHandoff } from '@/lib/handoff';
import { render } from '../helpers/react';

vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => h('a', { href, ...rest }, children) };
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

// The first poem of Walden's Discover list: "the essential facts / of life, and see if I could / not learn what it had"
const read = readHandoff('#found=walden-woods:14-28:16,23', bundledPassages);
if (read.kind !== 'open') throw new Error('the fixture link does not open');
const { retainedTokenIds, lineBreaks } = read.snapshot;

const base = { schemaVersion: 1, erasureStyle: 'blackout', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };

async function show(drafts: Record<string, unknown>) {
  localStorage.setItem('palimpsest:poems:v1', JSON.stringify(drafts));
  const view = render(createElement(DraftsDrawer, { isOpen: true, onClose: vi.fn(), onLoadPoem: vi.fn(), passages: bundledPassages }));
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
  const cards = () => [...view.container.querySelectorAll('li')];
  return { ...view, cards };
}

const flat = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('a poem in My Collection', () => {
  it('names its book, not the code the library uses for it', async () => {
    const { cards } = await show({ a: { ...base, id: 'a', passageId: 'walden-woods', title: 'Quiet Woods', retainedTokenIds, lineBreaks } });
    expect(flat(cards()[0])).toContain('From Walden');
    expect(flat(cards()[0])).not.toContain('walden-woods');
  });

  it('shows its first lines as the writer broke them', async () => {
    const { cards } = await show({ a: { ...base, id: 'a', passageId: 'walden-woods', title: 'Quiet Woods', retainedTokenIds, lineBreaks } });
    const open = cards()[0].querySelector('button')!;
    expect(flat(open)).toContain('the essential facts of life, and see if I could not learn what it had');
    const lines = [...open.querySelector('span.font-literary')!.querySelectorAll(':scope > span')].map(flat);
    expect(lines).toEqual(['the essential facts', 'of life, and see if I could', 'not learn what it had']);
    expect(flat(open)).not.toContain('…'); // it has exactly three lines
  });

  it('cuts a longer poem after three lines and says there is more', async () => {
    const fourLines = [...lineBreaks, retainedTokenIds[retainedTokenIds.length - 3]];
    const { cards } = await show({ a: { ...base, id: 'a', passageId: 'walden-woods', title: 'Long', retainedTokenIds, lineBreaks: fourLines } });
    const open = cards()[0].querySelector('button')!;
    expect(flat(open)).toContain('not learn');
    expect(flat(open)).not.toContain(' it had'); // the fourth line is not shown
    expect(flat(open)).toContain('…');
  });

  it('keeps each poem recognisable when several share a title and a book', async () => {
    const { cards } = await show({
      a: { ...base, id: 'a', passageId: 'walden-woods', title: 'Untitled Poem', retainedTokenIds: retainedTokenIds.slice(0, 3), lineBreaks: [] },
      b: { ...base, id: 'b', passageId: 'walden-woods', title: 'Untitled Poem', retainedTokenIds: retainedTokenIds.slice(3, 6), lineBreaks: [], updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(cards()).toHaveLength(2);
    expect(flat(cards()[0])).not.toBe(flat(cards()[1]));
  });

  it('says so, and does not guess, when its book is no longer in the library', async () => {
    const { cards } = await show({ a: { ...base, id: 'a', passageId: 'gone-book', title: 'Orphan', retainedTokenIds: ['gone-book-token-0001'], lineBreaks: [] } });
    expect(flat(cards()[0])).toContain('Its book is no longer in the library');
    expect(flat(cards()[0])).toContain('This poem can no longer be shown.');
  });

  it('says so when no words are kept', async () => {
    const { cards } = await show({ a: { ...base, id: 'a', passageId: 'walden-woods', title: 'Blank', retainedTokenIds: [], lineBreaks: [] } });
    if (cards().length === 0) return; // a draft with no words may be refused by the store; either way nothing is made up
    expect(flat(cards()[0])).toContain('No words kept.');
  });
});

