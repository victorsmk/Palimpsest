// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { tokenize } from '@/lib/tokenizer';
import { ViewToggle } from '@/components/ViewToggle';
import { ExtractedPoem } from '@/components/ExtractedPoem';
import type { Attribution } from '@/lib/models';
import { click, render } from '../helpers/react';

const attribution: Attribution = {
  title: 'Walden',
  author: 'Henry David Thoreau',
  year: 1854,
  source: 'Project Gutenberg',
  url: 'https://www.gutenberg.org/ebooks/205',
  licenseNote: 'Public domain in the USA',
};

const words = tokenize('w', 'to front only the essential facts of life').filter(t => t.isSelectable);

function poem(overrides: Partial<Parameters<typeof ExtractedPoem>[0]> = {}) {
  return createElement(ExtractedPoem, {
    tokens: words,
    lineBreakSet: new Set<string>(),
    onToggleLineBreak: () => {},
    title: 'Essential',
    attribution,
    ...overrides,
  });
}

describe('ViewToggle', () => {
  it('marks only the active view as pressed', () => {
    const { container } = render(createElement(ViewToggle, { view: 'poem', onChange: () => {} }));
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['In the page', 'false'],
      ['Extracted poem', 'true'],
    ]);
  });

  it('reports the view the user picks', () => {
    const onChange = vi.fn();
    const { container } = render(createElement(ViewToggle, { view: 'page', onChange }));
    click(container.querySelectorAll('button')[1]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('poem');
  });
});

describe('ExtractedPoem', () => {
  it('shows the retained words in source order with title and attribution', () => {
    const { container } = render(poem());
    const text = container.textContent ?? '';
    expect(text).toContain('Essential');
    expect(text).toContain('Found in Walden, Henry David Thoreau (1854)');
    const rendered = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(rendered).toEqual(words.map(w => w.text));
  });

  it('falls back to an untitled heading', () => {
    const { container } = render(poem({ title: '' }));
    expect(container.querySelector('h2')?.textContent).toBe('Untitled poem');
  });

  it('breaks the line after exactly the words in the line-break set', () => {
    const after = new Set([words[3].id, words[6].id]); // "the", "of"
    const { container } = render(poem({ lineBreakSet: after }));

    expect(container.querySelectorAll('br')).toHaveLength(2);
    const pressed = [...container.querySelectorAll('button[aria-pressed=true]')];
    expect(pressed.map(b => b.textContent?.replace('↵', ''))).toEqual(['the', 'of']);

    // Each <br> directly follows one of those buttons.
    for (const br of container.querySelectorAll('br')) {
      expect(br.previousElementSibling?.getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('asks to toggle the clicked word, by id', () => {
    const onToggleLineBreak = vi.fn();
    const { container } = render(poem({ onToggleLineBreak }));
    click(container.querySelectorAll('button')[4]);
    expect(onToggleLineBreak).toHaveBeenCalledExactlyOnceWith(words[4].id);
  });

  it('shows guidance instead of verse when every word is erased', () => {
    const { container } = render(poem({ tokens: [] }));
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.textContent).toContain('All words are erased');
  });
});
