// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { BrowserBookRepository } from '@/lib/repositories';
import DiscoverPage from '@/app/discover/DiscoverPage';
import AssistPage from '@/app/assist/AssistPage';
import StudioPage from '@/app/studio/StudioPage';
import { render, click } from '../helpers/react';

// The screens open with every passage listed but only the passage they show loaded; the others are
// fetched when they are chosen. This is the proof, on the real pages, with the real bundled library.

vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => h('a', { href, ...rest }, children) };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

let fetched: string[];

beforeEach(async () => {
  fetched = [];
  const original = BrowserBookRepository.prototype.getPassage;
  vi.spyOn(BrowserBookRepository.prototype, 'getPassage').mockImplementation(async function (this: BrowserBookRepository, id: string) {
    fetched.push(id);
    return original.call(this, id);
  });
  // One library for the whole app: a fresh one, so what an earlier test loaded does not count.
  const { bookService } = await import('@/lib/services');
  (bookService as unknown as { library: unknown }).library = null;
  window.location.hash = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
});

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === name);

describe('Discover', () => {
  it('loads the first passage only, and another when it is chosen', async () => {
    const view = render(createElement(DiscoverPage));
    await settle();
    expect(fetched).toEqual(['jane-eyre-ch1']);
    expect(button(view.container, 'Walden')).toBeDefined(); // listed, not loaded
    click(button(view.container, 'Walden'));
    await settle();
    expect(fetched).toEqual(['jane-eyre-ch1', 'walden-woods']);
    expect(button(view.container, 'Walden')?.getAttribute('aria-pressed')).toBe('true');
    view.unmount();
  });

  it('loads the passage a link names, and not the first', async () => {
    window.location.hash = '#passage=dorian-gray-ch1';
    const view = render(createElement(DiscoverPage));
    await settle();
    expect(fetched).toEqual(['dorian-gray-ch1']);
    view.unmount();
  });

  it('does not fetch a passage again when it is chosen a second time', async () => {
    const view = render(createElement(DiscoverPage));
    await settle();
    click(button(view.container, 'Walden'));
    await settle();
    click(button(view.container, 'Jane Eyre'));
    await settle();
    click(button(view.container, 'Walden'));
    await settle();
    expect(fetched).toEqual(['jane-eyre-ch1', 'walden-woods']);
    view.unmount();
  });
});

describe('Assisted', () => {
  it('loads the first passage only', async () => {
    const view = render(createElement(AssistPage));
    await settle();
    expect(fetched).toEqual(['jane-eyre-ch1']);
    view.unmount();
  });
});

describe('the Studio', () => {
  it('starts on the first passage and loads nothing else', async () => {
    const view = render(createElement(StudioPage));
    await settle();
    expect(fetched).toEqual(['jane-eyre-ch1']);
    view.unmount();
  });

  it('loads the passage a hand-off link names, as well as the first one it falls back to', async () => {
    window.location.hash = '#found=walden-woods:14-28:16,23';
    const view = render(createElement(StudioPage));
    await settle();
    expect([...fetched].sort()).toEqual(['jane-eyre-ch1', 'walden-woods']);
    view.unmount();
  });

  it('loads a passage when it is chosen, and only then', async () => {
    const view = render(createElement(StudioPage));
    await settle();
    click(button(view.container, 'Walden'));
    await settle();
    expect(fetched).toEqual(['jane-eyre-ch1', 'walden-woods']);
    view.unmount();
  });
});
