// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createElement } from 'react';
import { AssistBody, FIRST_PAGE, PAGE_STEP } from '@/components/AssistBody';
import type { AssistedPoemsState } from '@/components/useAssistedPoems';
import { bundledPassages } from '@/lib/library/bundled';
import { assistedHandoffFromCandidate, assistedHandoffHref } from '@/lib/handoff';
import { assistedSearch, type AssistedSearchResult } from '@/lib/search/assisted';
import { getSyllableMap, lookupWord } from '@/lib/syllables';
import { click, render } from '../helpers/react';

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
let result: AssistedSearchResult;

beforeAll(async () => {
  const dictionary = await getSyllableMap();
  const words = walden.tokens.filter(t => t.isSelectable && t.kind === 'word');
  const syllables = new Map(words.map(t => [t.id, lookupWord(t.word, dictionary)]));
  result = assistedSearch(walden.tokens, syllables, walden.id, { limit: 50 });
});

afterEach(() => {
  document.body.innerHTML = '';
});

const flat = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const ready = (r: AssistedSearchResult = result): AssistedPoemsState => ({ status: 'ready', result: r });

function show(state: AssistedPoemsState = ready(), onChoosePassage = vi.fn()) {
  const view = render(createElement(AssistBody, { passage: walden, state, otherPassages: others, onChoosePassage }));
  const cards = () => [...view.container.querySelectorAll('article')];
  const more = () => [...view.container.querySelectorAll('button')].find(b => /^Show \d+ more/.test(b.textContent ?? ''));
  return { ...view, cards, more, onChoosePassage };
}

const textOf = (tokens: { text: string }[]) => tokens.map(t => t.text).join(' ');

describe('AssistBody: the poems to make', () => {
  it('has enough poems on real Walden to page through', () => {
    expect(result.candidates.length).toBeGreaterThan(FIRST_PAGE);
    expect(result.candidates.length).toBeLessThanOrEqual(2 * FIRST_PAGE + PAGE_STEP);
  });

  it('says how many poems there are, in plain words', () => {
    const { container } = show();
    expect(flat(container.querySelector('#assist-count-heading'))).toBe(`${result.candidates.length} poems to make`);
  });

  it('uses the singular for a single poem', () => {
    const one = { ...result, candidates: result.candidates.slice(0, 1) };
    const { container, cards, more } = show(ready(one));
    expect(flat(container.querySelector('#assist-count-heading'))).toBe('1 poem to make');
    expect(cards()).toHaveLength(1);
    expect(more()).toBeUndefined();
  });

  it('says it is a selection and how the poems were chosen, and shows no scores', () => {
    const { container } = show();
    const text = flat(container);
    expect(text).toContain('A selection, not every possible poem');
    expect(text).toContain('no two are much alike');
    expect(text).not.toMatch(/score/i);
    expect(text).not.toMatch(/haiku/i); // the spec asks for "5–7–5 poem", not "haiku"
    expect(text).not.toContain('hit its limit');
  });

  it('says so when the search hit its work limit', () => {
    const limited = { ...result, stats: { ...result.stats, workLimitReached: true } };
    expect(flat(show(ready(limited)).container)).toContain('hit its limit in places');
  });

  it('explains the marking: highlighted words are kept, struck-through ones are erased', () => {
    const { container } = show();
    expect(flat(container)).toContain('highlighted words are kept; struck-through words are the ones erased');
  });

  it('shows the first few poems, then more on request, until there are no more', () => {
    const total = result.candidates.length;
    const { cards, more, container } = show();
    expect(cards()).toHaveLength(FIRST_PAGE);
    expect(flat(more())).toBe(`Show ${Math.min(PAGE_STEP, total - FIRST_PAGE)} more ${total - FIRST_PAGE === 1 ? 'poem' : 'poems'}`);
    expect(flat(container.querySelector('[role="status"]'))).toBe(''); // nothing announced until more are asked for

    click(more());
    expect(cards()).toHaveLength(Math.min(total, FIRST_PAGE + PAGE_STEP));
    expect(flat(container.querySelector('[role="status"]'))).toBe(`Showing ${Math.min(total, FIRST_PAGE + PAGE_STEP)} of ${total} poems.`);

    while (more()) click(more());
    expect(cards()).toHaveLength(total);
    expect(more()).toBeUndefined();
  });

  it('keeps the same poems in the same order as more are shown', () => {
    const { cards, more } = show();
    const firstFew = cards().map(c => flat(c.querySelector('p')));
    click(more());
    expect(cards().slice(0, FIRST_PAGE).map(c => flat(c.querySelector('p')))).toEqual(firstFew);
  });

  it('shows each poem as its three lines, in ranked order, each in an article named by its number', () => {
    const { cards } = show();
    cards().forEach((card, i) => {
      const poem = result.candidates[i];
      expect(card.getAttribute('aria-labelledby')).toBe(`assisted-poem-${i + 1}-heading`);
      expect(flat(card.querySelector('h2'))).toBe(`Poem ${i + 1}`);
      expect(flat(card.querySelector('p'))).toBe([poem.line1, poem.line2, poem.line3].map(l => textOf(l.tokens)).join(' '));
    });
  });

  it('puts the lines on separate lines, with a real space as well as a break after each', () => {
    const first = show().cards()[0].querySelector('p')!;
    expect(first.querySelectorAll('br')).toHaveLength(3);
    expect(first.textContent).toBe(
      [result.candidates[0].line1, result.candidates[0].line2, result.candidates[0].line3].map(l => `${textOf(l.tokens)} `).join('')
    );
  });

  it('shows the passage the poem was taken from, with exactly the poem\'s words marked and the rest struck through', () => {
    const { cards } = show();
    cards().forEach((card, i) => {
      const poem = result.candidates[i];
      const source = card.querySelectorAll('p')[1];
      const kept = [...source.querySelectorAll('mark')].map(m => m.textContent);
      const erased = [...source.querySelectorAll('span.line-through')].map(s => s.textContent);

      // The marked words are the poem's, in order.
      expect(kept, `poem ${i + 1}`).toEqual([poem.line1, poem.line2, poem.line3].flatMap(l => l.tokens.map(t => t.text)));
      // Together they are the passage from the poem's first word to its last, in order, with nothing added.
      const range = walden.tokens.filter(t => t.position >= poem.startPosition && t.position <= poem.endPosition);
      expect(flat(source), `poem ${i + 1}`).toBe(textOf(range));
      expect(kept.length + erased.length).toBe(range.length);
      // And the words skipped are the ones the search reports.
      expect(erased.length).toBeGreaterThanOrEqual(poem.skippedWords);
    });
  });

  it('says where the poem sits and how much of that stretch it keeps', () => {
    const poem = result.candidates[0];
    const kept = [poem.line1, poem.line2, poem.line3].reduce((sum, l) => sum + l.tokens.length, 0);
    const meta = flat([...show().cards()[0].querySelectorAll('span')].find(s => /^words /.test(s.textContent ?? '')));
    expect(meta).toBe(`words ${poem.startWord + 1}–${poem.endWord + 1} of ${result.stats.wordCount} · keeps ${kept} of ${poem.endWord - poem.startWord + 1}`);
  });

  it('links each poem to the Studio with exactly its words', () => {
    const { cards } = show();
    cards().forEach((card, i) => {
      const link = card.querySelector('a')!;
      expect(link.getAttribute('aria-label')).toBe(`Open poem ${i + 1} in the editor`);
      expect(link.getAttribute('href')).toBe(assistedHandoffHref(assistedHandoffFromCandidate(result.candidates[i])));
    });
  });
});

describe('AssistBody: the other states', () => {
  it('says it is looking while the poems are being worked out', () => {
    const { container, cards } = show({ status: 'loading' });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Looking for poems…');
    expect(cards()).toHaveLength(0);
  });

  it('says plainly when the poems could not be worked out', () => {
    const { container, cards } = show({ status: 'unavailable' });
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/could not be worked out/);
    expect(cards()).toHaveLength(0);
  });

  it('explains an empty result and offers the other passages', () => {
    const none = { candidates: [], stats: { ...result.stats, poemsConsidered: 0 } };
    const { container, onChoosePassage } = show(ready(none));
    expect(flat(container.querySelector('h2'))).toBe('No poems to make here');
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map(b => flat(b))).toEqual(others.map(p => `Try ${p.attribution.title}`));
    click(buttons[0]);
    expect(onChoosePassage).toHaveBeenCalledWith(others[0].id);
  });
});
