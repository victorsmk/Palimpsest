// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StrictMode, act, createElement } from 'react';
import { tokenize } from '@/lib/tokenizer';
import { BookText } from '@/components/BookText';
import { SaveDraftModal } from '@/components/SaveDraftModal';
import { DraftsDrawer } from '@/components/DraftsDrawer';
import { StyleSelector } from '@/components/StyleSelector';
import type { Poem } from '@/lib/models';
import { bundledPassages } from '@/lib/library/bundled';
import { click, render } from '../helpers/react';

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    );
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('BookText keyboard access', () => {
  const tokens = tokenize('p', 'I went to the woods—because I wished.\n\nTo live deliberately.');
  const paragraphs = [
    tokens.filter(t => t.paragraphIndex === 0),
    tokens.filter(t => t.paragraphIndex === 1),
  ];
  const words = tokens.filter(t => t.isSelectable);

  function mount(retained = new Set(words.map(w => w.id)), onToggle = vi.fn()) {
    const view = render(
      createElement(BookText, { paragraphs, retainedSet: retained, style: 'blackout', onToggle })
    );
    const buttons = () =>
      [...view.container.querySelectorAll<HTMLButtonElement>('button[data-token-id]')];
    return { ...view, buttons, onToggle };
  }

  it('makes every word a button but only one tab stop', () => {
    const { buttons } = mount();
    expect(buttons()).toHaveLength(words.length);
    expect(buttons().filter(b => b.tabIndex === 0)).toHaveLength(1);
    expect(buttons()[0].tabIndex).toBe(0);
  });

  it('reports kept and erased words through aria-pressed', () => {
    const { buttons } = mount(new Set([words[1].id, words[3].id]));
    const pressed = buttons()
      .filter(b => b.getAttribute('aria-pressed') === 'true')
      .map(b => b.textContent);
    expect(pressed).toEqual(['went', 'the']);
    expect(buttons().filter(b => b.getAttribute('aria-pressed') === 'false')).toHaveLength(
      words.length - 2
    );
  });

  it('moves focus with the arrow keys, Home and End, and the tab stop follows', () => {
    const { buttons } = mount();
    const all = buttons();

    act(() => all[0].focus());
    press(all[0], 'ArrowRight');
    expect(document.activeElement).toBe(all[1]);
    expect(buttons().filter(b => b.tabIndex === 0)).toEqual([all[1]]);

    press(all[1], 'ArrowLeft');
    expect(document.activeElement).toBe(all[0]);

    press(all[0], 'End');
    expect(document.activeElement).toBe(all[all.length - 1]);
    press(all[all.length - 1], 'ArrowRight'); // stays on the last word
    expect(document.activeElement).toBe(all[all.length - 1]);

    press(all[all.length - 1], 'Home');
    expect(document.activeElement).toBe(all[0]);
  });

  it('moves focus across paragraph boundaries', () => {
    const { buttons } = mount();
    const wished = buttons().find(b => b.textContent === 'wished.')!;
    act(() => wished.focus());
    press(wished, 'ArrowRight');
    expect(document.activeElement?.textContent).toBe('To');
  });

  it('leaves modified arrow keys alone', () => {
    const { buttons } = mount();
    const all = buttons();
    act(() => all[0].focus());
    press(all[0], 'ArrowRight', { ctrlKey: true });
    expect(document.activeElement).toBe(all[0]);
  });

  it('toggles the clicked word by id', () => {
    const { buttons, onToggle } = mount();
    click(buttons()[2]);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(words[2].id);
  });

  it('hides em dash separators from assistive technology', () => {
    const { container } = mount();
    const dash = [...container.querySelectorAll('span')].find(s => s.textContent === '—');
    expect(dash?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('SaveDraftModal as a dialog', () => {
  function mountModal(onClose = vi.fn()) {
    const opener = document.createElement('button');
    opener.textContent = 'open';
    document.body.appendChild(opener);
    opener.focus();

    const props = {
      initialTitle: 'Winter',
      initialNotes: '',
      passageTitle: 'Walden',
      retainedCount: 3,
      onSave: async () => {},
      onClose,
    };
    const view = render(createElement(SaveDraftModal, { isOpen: true, ...props }));
    return { ...view, opener, props, onClose };
  }

  it('is a labelled modal dialog and focuses the title field', () => {
    const { container } = mountModal();
    const dialog = container.querySelector('[role=dialog]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Save Poem Draft'
    );
    expect(document.activeElement).toBe(container.querySelector('#poem-title'));
  });

  it('closes on Escape', () => {
    const { container, onClose } = mountModal();
    press(container.querySelector('#poem-title')!, 'Escape');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    const { container } = mountModal();
    const focusable = [...container.querySelectorAll<HTMLElement>('button, input, textarea')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    act(() => last.focus());
    press(last, 'Tab');
    expect(document.activeElement).toBe(first);

    act(() => first.focus());
    press(first, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('gives focus back to the opener when it closes', () => {
    const { rerender, opener, props } = mountModal();
    expect(document.activeElement).not.toBe(opener);
    rerender(createElement(SaveDraftModal, { isOpen: false, ...props }));
    expect(document.activeElement).toBe(opener);
  });

  it('still focuses the title field, and returns focus, under StrictMode double effects', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const props = {
      initialTitle: 'Winter',
      initialNotes: '',
      passageTitle: 'Walden',
      retainedCount: 3,
      onSave: async () => {},
      onClose: () => {},
    };
    const { container, rerender } = render(
      createElement(StrictMode, null, createElement(SaveDraftModal, { isOpen: true, ...props }))
    );
    expect(document.activeElement).toBe(container.querySelector('#poem-title'));

    rerender(
      createElement(StrictMode, null, createElement(SaveDraftModal, { isOpen: false, ...props }))
    );
    expect(document.activeElement).toBe(opener);
  });

  it('labels its close button', () => {
    const { container } = mountModal();
    expect(container.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });
});

describe('DraftsDrawer keyboard access', () => {
  const poem: Poem = {
    id: 'p1',
    schemaVersion: 2, revision: 1,
    passageId: 'walden-woods',
    retainedTokenIds: ['walden-woods-token-0000'],
    lineBreaks: [],
    erasureStyle: 'faded',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    title: 'Pond',
  };

  async function mountDrawer(onLoadPoem = vi.fn(), onClose = vi.fn()) {
    localStorage.setItem('palimpsest:poems:v1', JSON.stringify({ p1: poem }));
    const view = render(createElement(DraftsDrawer, { isOpen: true, onClose, onLoadPoem, passages: bundledPassages }));
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    return { ...view, onLoadPoem, onClose };
  }

  it('is a labelled modal dialog that closes on Escape', async () => {
    const { container, onClose } = await mountDrawer();
    const dialog = container.querySelector('[role=dialog]')!;
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Saved Poems & Drafts'
    );
    press(dialog, 'Escape');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens and deletes a draft with two separate named buttons', async () => {
    const { container, onLoadPoem, onClose } = await mountDrawer();
    const open = [...container.querySelectorAll('li button')].find(b =>
      b.textContent?.includes('Pond')
    )!;
    const del = container.querySelector('button[aria-label="Delete draft Pond"]')!;
    expect(open.contains(del)).toBe(false);

    click(open);
    expect(onLoadPoem).toHaveBeenCalledExactlyOnceWith(poem);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('asks before deleting, in a dialog of its own, and does not open the draft', async () => {
    const { container, onLoadPoem } = await mountDrawer();
    click(container.querySelector('button[aria-label="Delete draft Pond"]'));
    const confirm = container.querySelector('[role=alertdialog]')!;
    expect(confirm).not.toBeNull();
    expect(confirm.querySelector('h2')!.textContent).toBe('Delete “Pond”?');
    expect(onLoadPoem).not.toHaveBeenCalled();
    expect(container.querySelectorAll('li')).toHaveLength(1); // nothing deleted yet
  });

  it('starts on Cancel, and Escape cancels without closing the collection or deleting anything', async () => {
    const { container, onClose } = await mountDrawer();
    click(container.querySelector('button[aria-label="Delete draft Pond"]'));
    const confirm = container.querySelector('[role=alertdialog]')!;
    expect(document.activeElement?.textContent).toBe('Cancel');

    press(confirm, 'Escape');
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(container.querySelector('[role=alertdialog]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled(); // the collection stays open
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(document.activeElement).toBe(container.querySelector('button[aria-label="Delete draft Pond"]'));
  });

  it('deletes only when confirmed, then keeps the reader inside the collection', async () => {
    const { container } = await mountDrawer();
    click(container.querySelector('button[aria-label="Delete draft Pond"]'));
    const confirmButton = [...container.querySelectorAll('[role=alertdialog] button')].find(b => b.textContent === 'Delete poem')!;
    click(confirmButton);
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await new Promise(r => setTimeout(r, 0));
      });
    }
    expect(container.querySelector('[role=alertdialog]')).toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.textContent).toContain('No drafts yet');
    expect(JSON.parse(localStorage.getItem('palimpsest:poems:v1') ?? '{}')).toEqual({});
    expect(document.activeElement).toBe(container.querySelector('[role=dialog]'));
  });
});

describe('StyleSelector', () => {
  it('exposes the chosen style as pressed inside a labelled group', () => {
    const { container } = render(
      createElement(StyleSelector, { currentStyle: 'faded', onSelectStyle: () => {} })
    );
    const group = container.querySelector('[role=group]')!;
    expect(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Erasure Style'
    );
    const state = [...group.querySelectorAll('button')].map(b => b.getAttribute('aria-pressed'));
    expect(state).toEqual(['false', 'true', 'false']);
  });
});
