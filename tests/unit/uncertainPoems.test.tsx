// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { DiscoverBody } from '@/components/DiscoverBody';
import { AssistBody } from '@/components/AssistBody';
import type { FoundAnalysisState } from '@/components/useFoundAnalysis';
import type { AssistedPoemsState, UncertainPoemsState } from '@/components/useAssistedPoems';
import { bundledPassages } from '@/lib/library/bundled';
import { assistedHandoffFromCandidate, assistedHandoffHref, foundHandoffFromCandidate, foundHandoffHref } from '@/lib/handoff';
import { analyzeFound, foundSearch, type FoundAnalysis } from '@/lib/search/found';
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

const jane = bundledPassages.find(p => p.id === 'jane-eyre-ch1')!;
const walden = bundledPassages.find(p => p.id === 'walden-woods')!;
let janeAnalysis: FoundAnalysis;
let waldenAnalysis: FoundAnalysis;
let janeAssisted: AssistedSearchResult;
let janeUncertain: AssistedSearchResult;

beforeAll(async () => {
  const dictionary = await getSyllableMap();
  const syllablesOf = (passage: typeof jane) =>
    new Map(passage.tokens.filter(t => t.isSelectable && t.kind === 'word').map(t => [t.id, lookupWord(t.word, dictionary)]));
  const janeSyllables = syllablesOf(jane);
  janeAnalysis = analyzeFound(jane.tokens, foundSearch(jane.tokens, janeSyllables, jane.id, { allowUncertain: true }));
  const waldenSyllables = syllablesOf(walden);
  waldenAnalysis = analyzeFound(walden.tokens, foundSearch(walden.tokens, waldenSyllables, walden.id, { allowUncertain: true }));
  janeAssisted = assistedSearch(jane.tokens, janeSyllables, jane.id, { limit: 50 });
  janeUncertain = assistedSearch(jane.tokens, janeSyllables, jane.id, { limit: 50, allowUncertain: true, onlyUncertain: true });
});

afterEach(() => {
  document.body.innerHTML = '';
});

const flat = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Discover: poems that depend on how a word is said', () => {
  const show = (passage: typeof jane, analysis: FoundAnalysis) => {
    const state: FoundAnalysisState = { status: 'ready', analysis };
    const view = render(createElement(DiscoverBody, { passage, state, otherPassages: [], onChoosePassage: vi.fn() }));
    const toggle = () => [...view.container.querySelectorAll('button')].find(b => /depend/.test(b.textContent ?? ''));
    const panel = () => view.container.querySelector<HTMLElement>(`#${toggle()?.getAttribute('aria-controls')}`);
    return { ...view, toggle, panel };
  };

  it('has uncertain poems in Jane Eyre and none after the weak-ending filter in Walden', () => {
    expect(janeAnalysis.uncertainFamilies).toHaveLength(7);
    expect(waldenAnalysis.uncertainFamilies).toHaveLength(0);
  });

  it('leaves the headline and the poems to find as they were, counting only the definite ones', () => {
    const { container } = show(jane, janeAnalysis);
    expect(flat(container.querySelector('#discover-dna-heading'))).toBe('8 poems to find');
    expect(janeAnalysis.pageDna.poemsToFind).toBe(8);
    expect(janeAnalysis.pageDna.blocks).toHaveLength(8); // none of the uncertain poems is on the strip
    const visibleCards = [...container.querySelectorAll('article')].filter(card => !card.closest('[hidden]'));
    expect(visibleCards).toHaveLength(8);
  });

  it('offers them behind a button that says how many, collapsed to begin with', () => {
    const { toggle, panel } = show(jane, janeAnalysis);
    expect(flat(toggle())).toBe('▸ 7 more poems depend on how a word is said');
    expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
    expect(panel()!.hidden).toBe(true);
  });

  it('opens and closes the section', () => {
    const { toggle, panel } = show(jane, janeAnalysis);
    click(toggle());
    expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
    expect(panel()!.hidden).toBe(false);
    expect(flat(toggle())).toBe('▾ 7 more poems depend on how a word is said');
    click(toggle());
    expect(panel()!.hidden).toBe(true);
  });

  it('explains what these poems are, then lists them as Uncertain poem 1 to 7, in reading order', () => {
    const { toggle, panel } = show(jane, janeAnalysis);
    click(toggle());
    expect(flat(panel()!.querySelector('p'))).toBe('These are 5–7–5 only if a word is counted a certain way. Say them aloud and decide for yourself.');
    const cards = [...panel()!.querySelectorAll('article')];
    expect(cards).toHaveLength(7);
    cards.forEach((card, i) => expect(flat(card.querySelector('h2'))).toBe(`Uncertain poem ${i + 1}`));
  });

  it('shows the first uncertain poem with its note, exactly as found', () => {
    const { toggle, panel } = show(jane, janeAnalysis);
    click(toggle());
    const [first] = [...panel()!.querySelectorAll('article')];
    expect(flat(first.querySelector('p'))).toBe('wind had brought with it clouds so sombre, and a rain so penetrating,');
    expect([...first.querySelectorAll('ul')[0].querySelectorAll('li')].map(li => flat(li))).toEqual([
      '“sombre” is not in our dictionary. We estimated 2 syllables, from “somber”.',
    ]);
  });

  it('puts a note on every poem, each naming a word that really is in that poem', () => {
    const { toggle, panel } = show(jane, janeAnalysis);
    click(toggle());
    const cards = [...panel()!.querySelectorAll('article')];
    cards.forEach((card, i) => {
      const family = janeAnalysis.uncertainFamilies[i];
      const text = flat(card.querySelector('p')).toLowerCase();
      const notes = [...card.querySelectorAll('ul')[0].querySelectorAll('li')].map(li => flat(li));
      expect(notes.length, `poem ${i + 1}`).toBeGreaterThan(0);
      for (const note of notes) {
        const word = /^“([^”]+)”/.exec(note)![1];
        expect(text, `${word} in poem ${i + 1}`).toContain(word);
      }
      expect(family.representative.hasUncertain).toBe(true);
    });
  });

  it('links each to the Studio with its own words, and names the links apart from the main poems\'', () => {
    const { toggle, panel, container } = show(jane, janeAnalysis);
    click(toggle());
    const links = [...panel()!.querySelectorAll<HTMLAnchorElement>('a')].filter(a => /^Open uncertain poem \d+ in the editor$/.test(a.getAttribute('aria-label') ?? ''));
    expect(links).toHaveLength(7);
    links.forEach((link, i) => {
      expect(link.getAttribute('aria-label')).toBe(`Open uncertain poem ${i + 1} in the editor`);
      expect(link.getAttribute('href')).toBe(foundHandoffHref(foundHandoffFromCandidate(janeAnalysis.uncertainFamilies[i].representative)));
    });
    // No two controls or cards on the page share a name or an id.
    const ids = [...container.querySelectorAll('[id]')].map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = [...container.querySelectorAll('a[aria-label]')].map(a => a.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('shows no such button when no poem depends on a word being counted a certain way', () => {
    const { toggle, container } = show(walden, waldenAnalysis);
    expect(toggle()).toBeUndefined();
    expect(flat(container)).not.toContain('depend');
  });

  it('uses the singular for one poem', () => {
    const one = { ...janeAnalysis, uncertainFamilies: janeAnalysis.uncertainFamilies.slice(0, 1) };
    expect(flat(show(jane, one).toggle())).toBe('▸ 1 more poem depends on how a word is said');
  });

  it('still shows them when there is nothing definite to find', () => {
    const none = { ...janeAnalysis, families: [], pageDna: { ...janeAnalysis.pageDna, poemsToFind: 0, blocks: [], wordsPerPoem: null } };
    const { container, toggle } = show(jane, none);
    expect(flat(container.querySelector('h2'))).toBe('No poems to find here');
    expect(toggle()).toBeDefined();
  });
});

describe('Assisted: poems that depend on how a word is said', () => {
  const ready = (result: AssistedSearchResult): AssistedPoemsState => ({ status: 'ready', result });
  const asked = (state: UncertainPoemsState) => vi.fn((_passage: unknown, wasAsked: boolean): UncertainPoemsState => (wasAsked ? state : { status: 'idle' }));

  function show(result: AssistedSearchResult, useUncertain: ReturnType<typeof asked>) {
    const view = render(
      createElement(AssistBody, {
        passage: jane,
        state: ready(result),
        otherPassages: [],
        onChoosePassage: vi.fn(),
        useUncertain: useUncertain as never,
      })
    );
    const ask = () => [...view.container.querySelectorAll('button')].find(b => /Also show poems/.test(b.textContent ?? ''));
    return { ...view, ask };
  }

  it('keeps them out of the main list and offers them behind a button', () => {
    const { container, ask } = show(janeAssisted, asked({ status: 'ready', result: janeUncertain }));
    expect(ask()).toBeDefined();
    expect(flat(ask())).toBe('Also show poems that depend on how a word is said');
    expect(container.querySelector('[aria-label="Poems that depend on how a word is said"]')).toBeNull();
    expect(janeAssisted.candidates.every(c => !c.hasUncertain)).toBe(true);
    expect(flat(container.querySelector('#assist-count-heading'))).toBe('14 poems to make');
  });

  it('does not ask for them until the button is pressed', () => {
    const stub = asked({ status: 'ready', result: janeUncertain });
    const { ask } = show(janeAssisted, stub);
    expect(stub.mock.calls.every(([, wasAsked]) => wasAsked === false)).toBe(true);
    click(ask());
    expect(stub.mock.calls.some(([, wasAsked]) => wasAsked === true)).toBe(true);
  });

  it('then lists them as Uncertain poem 1, 2 ..., each with a note and the uncertain word underlined', () => {
    expect(janeUncertain.candidates.length).toBeGreaterThan(0);
    expect(janeUncertain.candidates.every(c => c.hasUncertain)).toBe(true);

    const { container, ask } = show(janeAssisted, asked({ status: 'ready', result: janeUncertain }));
    click(ask());
    const region = container.querySelector('[aria-label="Poems that depend on how a word is said"]')!;
    expect(flat(region.querySelector('h2'))).toBe('Poems that depend on how a word is said');
    const cards = [...region.querySelectorAll('article')];
    expect(cards).toHaveLength(janeUncertain.candidates.length);

    cards.forEach((card, i) => {
      const poem = janeUncertain.candidates[i];
      expect(flat(card.querySelector('h2'))).toBe(`Uncertain poem ${i + 1}`);
      expect(card.querySelectorAll('ul li').length).toBeGreaterThan(0);
      const underlined = [...card.querySelectorAll('mark')].filter(m => m.className.includes('decoration-dotted'));
      const uncertainWords = [poem.line1, poem.line2, poem.line3].flatMap(l => l.tokens.filter((_, j) => l.syllableResults[j].confidence !== 'definite'));
      expect(underlined.map(m => m.textContent)).toEqual(uncertainWords.map(t => t.text));
      expect(card.querySelector('a')!.getAttribute('href')).toBe(assistedHandoffHref(assistedHandoffFromCandidate(poem)));
      expect(card.querySelector('a')!.getAttribute('aria-label')).toBe(`Open uncertain poem ${i + 1} in the editor`);
    });
  });

  it('takes focus to the new section, since the button goes away', () => {
    const { container, ask } = show(janeAssisted, asked({ status: 'ready', result: janeUncertain }));
    act(() => ask()!.focus());
    click(ask());
    expect(document.activeElement).toBe(container.querySelector('[aria-label="Poems that depend on how a word is said"]'));
    expect(ask()).toBeUndefined();
  });

  it('shows no underlines on the ordinary poems', () => {
    const { container } = show(janeAssisted, asked({ status: 'idle' }));
    expect(container.querySelectorAll('mark.underline, mark[class*="decoration-dotted"]')).toHaveLength(0);
    expect(container.querySelectorAll('article ul')).toHaveLength(0); // no notes either
  });

  it('says so when there are none', () => {
    const { container, ask } = show(janeAssisted, asked({ status: 'ready', result: { ...janeUncertain, candidates: [] } }));
    click(ask());
    expect(container.querySelector('[role="status"]:not(.sr-only)')?.textContent).toBe('No poems in this passage depend on how a word is said.');
  });

  it('says it is looking, and says plainly when it could not', () => {
    const loading = show(janeAssisted, asked({ status: 'loading' }));
    click(loading.ask());
    expect(flat(loading.container)).toContain('Looking for more poems…');
    document.body.innerHTML = '';
    const failed = show(janeAssisted, asked({ status: 'unavailable' }));
    click(failed.ask());
    expect(failed.container.querySelector('[role="alert"]')?.textContent).toMatch(/could not be worked out/);
  });

  it('offers nothing when the passage has no such words at all', () => {
    const plain = { ...janeAssisted, stats: { ...janeAssisted.stats, uncertainWords: 0 } };
    expect(show(plain, asked({ status: 'idle' })).ask()).toBeUndefined();
  });
});
