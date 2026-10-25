// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { DiscoverBody } from '@/components/DiscoverBody';
import type { FoundAnalysisState } from '@/components/useFoundAnalysis';
import { bundledPassages } from '@/lib/library/bundled';
import { readFoundHandoff } from '@/lib/handoff';
import { getSyllableMap, lookupWord } from '@/lib/syllables';
import { analyzeFound, foundSearch, type FoundAnalysis } from '@/lib/search/found';
import { click, render } from '../helpers/react';
import golden from '../fixtures/found-families.json';

// next/link needs the App Router; here it is just an anchor.
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
      h('a', { href, ...rest }, children),
  };
});

const walden = bundledPassages.find(p => p.id === 'walden-woods')!;
const others = bundledPassages.filter(p => p.id !== 'walden-woods');
let analysis: FoundAnalysis;

beforeAll(async () => {
  const dictionary = await getSyllableMap();
  const words = walden.tokens.filter(t => t.isSelectable && t.kind === 'word');
  const syllables = new Map(words.map(t => [t.id, lookupWord(t.word, dictionary)]));
  analysis = analyzeFound(walden.tokens, foundSearch(walden.tokens, syllables, walden.id));
});

const scrollIntoView = vi.fn();
afterEach(() => {
  document.body.innerHTML = ''; // each test renders into the document; nothing may leak into the next
});
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
});

const flat = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const ready = (a: FoundAnalysis = analysis): FoundAnalysisState => ({ status: 'ready', analysis: a });

function show(state: FoundAnalysisState = ready(), onChoosePassage = vi.fn()) {
  const view = render(createElement(DiscoverBody, { passage: walden, state, otherPassages: others, onChoosePassage }));
  const cards = () => [...view.container.querySelectorAll('article')];
  const blocks = () => [...view.container.querySelectorAll<HTMLButtonElement>('button[data-poem]')];
  return { ...view, cards, blocks, onChoosePassage };
}

describe('DiscoverBody: the poems to find', () => {
  it('leads with how many poems there are to find, in plain words', () => {
    const { container } = show();
    const heading = container.querySelector('#discover-dna-heading')!;
    expect(flat(heading)).toBe('9 poems to find');
    expect(flat(container)).toContain('about one every 24 words');
  });

  it('shows no per-100-words number and no hover box', () => {
    const { container } = show();
    expect(flat(container)).not.toContain('4.23');
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('lists one card per poem, in reading order, with the poem exactly as found', () => {
    const { cards } = show();
    expect(cards()).toHaveLength(9);
    cards().forEach((card, i) => {
      const expected = golden['walden-woods'].families[i];
      expect(flat(card.querySelector('h2'))).toBe(`Poem ${i + 1}`);
      expect(flat(card.querySelector('p.font-literary'))).toBe(expected.lines.join(' '));
    });
  });

  it('shows where each poem comes from: its words in the passage and the text around it', () => {
    const { cards } = show();
    const first = cards()[0];
    expect(flat(first)).toContain('words 15–29 of 213');

    const context = first.querySelector('mark')!.parentElement!;
    const expected = golden['walden-woods'].families[0];
    expect(flat(context.querySelector('mark'))).toBe(expected.lines.join(' '));
    // The source words just before and after, with an ellipsis where the passage goes on.
    expect(flat(context.children[0]).endsWith(expected.context.before)).toBe(true);
    expect(flat(context.children[2]).startsWith(expected.context.after)).toBe(true);
    expect(flat(context.children[0]).startsWith('…')).toBe(true);
    expect(flat(context.children[2]).endsWith('…')).toBe(true);
  });

  it('leaves out the ellipsis where the passage begins or ends', () => {
    const { cards } = show();
    const around = (i: number) => cards()[i].querySelector('mark')!.parentElement!.children;
    // Poem 9 is followed by the last four words of the passage ("and enjoy him forever.”"), so the
    // text shown runs to the end and nothing more follows it.
    expect(flat(around(8)[2])).toBe('and enjoy him forever.”');
    expect(flat(around(8)[2]).endsWith('…')).toBe(false);
    // Poem 1 is in the middle of the passage: it goes on at both ends.
    expect(flat(around(0)[0]).startsWith('…')).toBe(true);
    expect(flat(around(0)[2]).endsWith('…')).toBe(true);
  });

  it('shows no leading ellipsis when the poem begins at the very start of the passage', async () => {
    const dorian = bundledPassages.find(p => p.id === 'dorian-gray-ch1')!;
    const dictionary = await getSyllableMap();
    const words = dorian.tokens.filter(t => t.isSelectable && t.kind === 'word');
    const syllables = new Map(words.map(t => [t.id, lookupWord(t.word, dictionary)]));
    const dorianAnalysis = analyzeFound(dorian.tokens, foundSearch(dorian.tokens, syllables, dorian.id));

    const view = render(
      createElement(DiscoverBody, {
        passage: dorian,
        state: ready(dorianAnalysis),
        otherPassages: [],
        onChoosePassage: () => {},
      })
    );
    const context = view.container.querySelector('article mark')!.parentElement!.children;
    expect(flat(context[0])).toBe('The studio'); // everything before the poem, and it is the start
    expect(flat(context[2]).endsWith('…')).toBe(true); // but the passage goes on after it
  });

  it('opens each poem in the editor through a link the Studio understands', () => {
    const { cards } = show();
    const links = cards().map(c => c.querySelector<HTMLAnchorElement>('a[aria-label^="Open poem"]')!);
    expect(links[0].getAttribute('href')).toBe('/studio#found=walden-woods:14-28:16,23');
    expect(links[1].getAttribute('href')).toBe('/studio#found=walden-woods:24-38:28,35');
    expect(links[0].getAttribute('aria-label')).toBe('Open poem 1 in the editor');

    // Every link opens, in the Studio, exactly the poem its card shows.
    links.forEach((link, i) => {
      const hash = link.getAttribute('href')!.split('#')[1];
      const read = readFoundHandoff(hash, bundledPassages);
      expect(read.kind).toBe('open');
      if (read.kind !== 'open') return;
      const byId = new Map(read.passage.tokens.map(t => [t.id, t.text]));
      const words = read.snapshot.retainedTokenIds.map(id => byId.get(id)).join(' ');
      expect(words).toBe(golden['walden-woods'].families[i].lines.join(' '));
    });
  });
});

describe('DiscoverBody: other ways to read a poem', () => {
  it('keeps the variants out of sight until asked, and says how many there are', () => {
    const { cards } = show();
    const [one, , , four, five] = cards();
    const toggle = one.querySelector('button[aria-expanded]')!;
    expect(flat(toggle)).toContain('3 other ways to read this');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(one.querySelector<HTMLElement>('ul')!.hidden).toBe(true);

    expect(flat(four.querySelector('button[aria-expanded]'))).toContain('1 other way to read this'); // singular
    expect(five.querySelector('button[aria-expanded]')).toBeNull(); // nothing else to offer, so no control
    expect(five.querySelector('ul')).toBeNull();
  });

  it('opens and closes the list, and tells assistive technology which', () => {
    const { cards } = show();
    const card = cards()[1];
    const toggle = card.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    const list = card.querySelector<HTMLElement>('ul')!;
    expect(toggle.getAttribute('aria-controls')).toBe(list.id);

    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
  });

  it('lists the same stretch with the lines falling elsewhere, each with its own way into the editor', () => {
    const { cards } = show();
    const card = cards()[1];
    click(card.querySelector('button[aria-expanded]'));

    const items = [...card.querySelectorAll('ul li')];
    expect(items.map(item => flat(item.querySelector('p')))).toEqual([
      'what it had to teach, and not, when I came to die, discover that I',
      'to teach, and not, when I came to die, discover that I had not lived.',
      'and not, when I came to die, discover that I had not lived. I did',
    ]);
    const labels = items.map(item => item.querySelector('a')!.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Open variant 1 of poem 2 in the editor',
      'Open variant 2 of poem 2 in the editor',
      'Open variant 3 of poem 2 in the editor',
    ]);

    // Each variant link opens exactly the words and line breaks shown.
    items.forEach(item => {
      const read = readFoundHandoff(item.querySelector('a')!.getAttribute('href')!.split('#')[1], bundledPassages);
      expect(read.kind).toBe('open');
      if (read.kind !== 'open') return;
      const byId = new Map(read.passage.tokens.map(t => [t.id, t.text]));
      const breaks = new Set(read.snapshot.lineBreaks);
      const lines: string[] = [];
      let current: string[] = [];
      for (const id of read.snapshot.retainedTokenIds) {
        current.push(byId.get(id)!);
        if (breaks.has(id)) { lines.push(current.join(' ')); current = []; }
      }
      lines.push(current.join(' '));
      expect(lines.join(' ')).toBe(flat(item.querySelector('p')));
      expect(lines).toHaveLength(3);
    });
  });
});

describe('DiscoverBody: the strip', () => {
  it('has one numbered, labelled button per poem', () => {
    const { blocks, container } = show();
    expect(blocks()).toHaveLength(9);
    expect(blocks().map(b => b.getAttribute('aria-label'))).toEqual(
      Array.from({ length: 9 }, (_, i) => `Go to poem ${i + 1}`)
    );
    expect(flat(blocks()[2])).toBe('3');
    expect(container.querySelector('[role=group][aria-label^="Page DNA strip"]')).not.toBeNull();
  });

  it('takes you to the poem: scrolls to its card and puts focus there', () => {
    const { blocks, cards } = show();
    click(blocks()[2]);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(cards()[2]);
  });

  it('does not animate the scroll for people who ask for reduced motion', () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query })) as typeof window.matchMedia;
    const { blocks } = show();
    click(blocks()[0]);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('outlines the block of the card you are over, and the card of the block you are over', () => {
    const { blocks, cards } = show();
    const outlined = () => blocks().map(b => b.dataset.active);

    expect(outlined().every(v => v === 'false')).toBe(true);
    act(() => cards()[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(outlined()[1]).toBe('true');
    expect(cards()[1].dataset.active).toBe('true');
    act(() => cards()[1].dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    expect(outlined().every(v => v === 'false')).toBe(true);

    act(() => blocks()[4].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(cards()[4].dataset.active).toBe('true');
    expect(cards()[3].dataset.active).toBe('false');
  });
});

describe('DiscoverBody: when there is nothing to show', () => {
  const none = (overrides: Partial<FoundAnalysis>): FoundAnalysisState =>
    ready({
      wordCount: 213,
      families: [],
      pageDna: { poemsToFind: 0, per100Words: 0, wordsPerPoem: null, blocks: [] },
      hiddenByWeakEnding: 0,
      totalCandidates: 0,
      ...overrides,
    });

  it('says so, and why: nothing fits 5-7-5 at all', () => {
    const { container } = show(none({}));
    expect(flat(container.querySelector('h2'))).toBe('No poems to find here');
    expect(flat(container)).toContain('Nothing in this passage falls into three lines of 5, 7 and 5 syllables');
    expect(flat(container)).toContain('Words our dictionary does not know can also hide poems.');
    expect(container.querySelectorAll('article')).toHaveLength(0);
    expect(container.querySelector('button[data-poem]')).toBeNull();
  });

  it('says so, and why: everything that fits ends a line on a weak word', () => {
    const { container } = show(none({ hiddenByWeakEnding: 12, totalCandidates: 12 }));
    expect(flat(container)).toContain('every one of them ends a line on a word like “the” or “and”');
  });

  it('offers the other passages instead', () => {
    const { container, onChoosePassage } = show(none({}));
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map(b => flat(b))).toEqual(['Try Jane Eyre', 'Try The Picture of Dorian Gray']);
    click(buttons[1]);
    expect(onChoosePassage).toHaveBeenCalledExactlyOnceWith('dorian-gray-ch1');
  });
});

describe('DiscoverBody: while it works, and when it cannot', () => {
  it('says it is looking, and shows no poems', () => {
    const { container, cards } = show({ status: 'loading' });
    expect(container.querySelector('[role=status]')!.textContent).toBe('Looking for poems…');
    expect(cards()).toHaveLength(0);
  });

  it('says honestly when the poems could not be worked out', () => {
    const { container, cards } = show({ status: 'unavailable' });
    expect(flat(container.querySelector('[role=alert]'))).toContain('could not be worked out');
    expect(cards()).toHaveLength(0);
  });
});
