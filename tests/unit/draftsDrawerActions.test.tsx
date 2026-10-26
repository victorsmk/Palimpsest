// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { DraftsDrawer } from '@/components/DraftsDrawer';
import { bundledPassages } from '@/lib/library/bundled';
import { poemService } from '@/lib/services';
import { click, render } from '../helpers/react';

const STORAGE_KEY = 'palimpsest:poems:v1';
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const base = { schemaVersion: 2, revision: 1, passageId: 'walden-woods', erasureStyle: 'blackout', lineBreaks: [] };

const drafts = {
  newer: { ...base, id: 'newer', title: 'Quiet Woods', retainedTokenIds: ids(14, 16), createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
  older: { ...base, id: 'older', title: 'Old Pond', retainedTokenIds: ids(20, 23), notes: 'keep me', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
};

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
};

async function show(onRenamed = vi.fn(), onClose = vi.fn()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  const view = render(createElement(DraftsDrawer, { isOpen: true, onClose, onLoadPoem: vi.fn(), passages: bundledPassages, onRenamed }));
  await settle();
  const titles = () => [...view.container.querySelectorAll('li')].map(li => li.querySelector('.font-serif')?.textContent ?? '');
  const button = (label: string) => view.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const status = () => view.container.querySelector('[role="status"]')!.textContent;
  const alertText = () => view.container.querySelector('[role="alert"]')?.textContent ?? null;
  const field = () => view.container.querySelector<HTMLInputElement>('form input')!;
  return { ...view, titles, button, status, alertText, field, onRenamed, onClose };
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const press = (target: Element, key: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, { title: string; notes?: string; retainedTokenIds: string[] }>;

describe('the actions on a poem in My Collection', () => {
  it('has Rename, Duplicate and Delete for every poem, each named for its poem', async () => {
    const { button } = await show();
    for (const title of ['Quiet Woods', 'Old Pond']) {
      for (const verb of ['Rename', 'Duplicate', 'Delete']) expect(button(`${verb} draft ${title}`)).not.toBeNull();
    }
  });

  it('keeps the actions apart from the button that opens the poem', async () => {
    const { button, container } = await show();
    const open = container.querySelector('li button')!;
    for (const verb of ['Rename', 'Duplicate', 'Delete']) expect(open.contains(button(`${verb} draft Quiet Woods`))).toBe(false);
  });
});

describe('renaming', () => {
  it('opens a field with the current title, selected and focused', async () => {
    const { button, field } = await show();
    click(button('Rename draft Old Pond'));
    expect(field().value).toBe('Old Pond');
    expect(document.activeElement).toBe(field());
    expect(field().selectionStart).toBe(0);
    expect(field().selectionEnd).toBe('Old Pond'.length);
    expect(field().maxLength).toBe(120);
  });

  it('saves the new title, moves the poem to the top, says so, and tells the Studio', async () => {
    const { button, field, titles, status, container, onRenamed } = await show();
    expect(titles()).toEqual(['Quiet Woods', 'Old Pond']);
    click(button('Rename draft Old Pond'));
    type(field(), '  Evening Pond ');
    click([...container.querySelectorAll('button')].find(b => b.textContent === 'Save name')!);
    await settle();

    expect(titles()).toEqual(['Evening Pond', 'Quiet Woods']);
    expect(status()).toBe('Renamed to “Evening Pond”.');
    expect(container.querySelector('form')).toBeNull();
    expect(stored().older.title).toBe('Evening Pond');
    expect(stored().older.notes).toBe('keep me'); // nothing but the title changed
    expect(stored().older.retainedTokenIds).toEqual(ids(20, 23));
    expect(onRenamed).toHaveBeenCalledOnce();
    expect(onRenamed.mock.calls[0][0]).toMatchObject({ id: 'older', title: 'Evening Pond' });
  });

  it('puts focus back on that poem\'s Rename button, wherever it moved to', async () => {
    const { button, field, container } = await show();
    click(button('Rename draft Old Pond'));
    type(field(), 'Evening Pond');
    click([...container.querySelectorAll('button')].find(b => b.textContent === 'Save name')!);
    await settle();
    expect(document.activeElement).toBe(button('Rename draft Evening Pond'));
  });

  it('makes an empty title "Untitled Poem"', async () => {
    const { button, field, titles, container } = await show();
    click(button('Rename draft Old Pond'));
    type(field(), '   ');
    click([...container.querySelectorAll('button')].find(b => b.textContent === 'Save name')!);
    await settle();
    expect(titles()[0]).toBe('Untitled Poem');
  });

  it('shows how much of the limit is used only when it is getting close', async () => {
    const { button, field, container } = await show();
    click(button('Rename draft Old Pond'));
    expect(container.textContent).not.toContain('/120');
    type(field(), 'a'.repeat(105));
    expect(container.textContent).toContain('105/120');
  });

  it('is cancelled by Cancel, leaving the title as it was', async () => {
    const { button, field, titles, container, onRenamed } = await show();
    click(button('Rename draft Old Pond'));
    type(field(), 'Something else');
    click([...container.querySelectorAll('button')].find(b => b.textContent === 'Cancel')!);
    await settle();
    expect(titles()).toEqual(['Quiet Woods', 'Old Pond']);
    expect(stored().older.title).toBe('Old Pond');
    expect(onRenamed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Rename draft Old Pond'));
  });

  it('is cancelled by Escape, which does not also close the collection', async () => {
    const { button, field, titles, container, onClose } = await show();
    click(button('Rename draft Old Pond'));
    press(field(), 'Escape');
    await settle();
    expect(container.querySelector('form')).toBeNull();
    expect(titles()).toEqual(['Quiet Woods', 'Old Pond']);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Rename draft Old Pond'));
  });

  it('says plainly when it could not be saved, and keeps what was typed', async () => {
    vi.spyOn(poemService, 'renamePoem').mockRejectedValue(new Error('storage is full'));
    const { button, field, container, alertText, titles } = await show();
    click(button('Rename draft Old Pond'));
    type(field(), 'Evening Pond');
    click([...container.querySelectorAll('button')].find(b => b.textContent === 'Save name')!);
    await settle();
    expect(alertText()).toBe('Could not rename this poem. Please try again.');
    expect(field().value).toBe('Evening Pond');
    expect(field().getAttribute('aria-describedby')).toBe(container.querySelector('[role="alert"]')!.id);
    expect(titles()).toEqual(['Quiet Woods', '']); // the card being edited shows the field, not its title
    expect(stored().older.title).toBe('Old Pond');
  });
});

describe('duplicating', () => {
  it('adds a copy titled with "(copy)" in parentheses, at the top, and says so', async () => {
    const { button, titles, status } = await show();
    click(button('Duplicate draft Old Pond'));
    await settle();
    expect(titles()).toEqual(['Old Pond (copy)', 'Quiet Woods', 'Old Pond']);
    expect(status()).toBe('Duplicated as “Old Pond (copy)”.');
  });

  it('copies the words, notes and the rest, and leaves the original alone', async () => {
    const { button } = await show();
    click(button('Duplicate draft Old Pond'));
    await settle();
    const all = Object.values(stored());
    expect(all).toHaveLength(3);
    const copy = all.find(p => p.title === 'Old Pond (copy)')!;
    expect(copy).toMatchObject({ notes: 'keep me', retainedTokenIds: ids(20, 23) });
    expect(stored().older).toMatchObject(drafts.older);
  });

  it('shows the copy with the same first lines as the original', async () => {
    const { button, container } = await show();
    click(button('Duplicate draft Old Pond'));
    await settle();
    const [copy, , original] = [...container.querySelectorAll('li')];
    const preview = (li: Element) => li.querySelector('span.font-literary')!.textContent;
    expect(preview(copy)).toBe(preview(original));
    expect(preview(copy)).not.toBe('');
  });

  it('makes one copy however fast the button is pressed', async () => {
    const { button } = await show();
    const duplicateButton = button('Duplicate draft Old Pond');
    click(duplicateButton);
    click(duplicateButton);
    await settle();
    expect(Object.keys(stored())).toHaveLength(3);
  });

  it('keeps focus on the button that was pressed', async () => {
    const { button } = await show();
    act(() => button('Duplicate draft Old Pond').focus());
    click(button('Duplicate draft Old Pond'));
    await settle();
    expect(document.activeElement).toBe(button('Duplicate draft Old Pond'));
  });

  it('says plainly when it could not be done, and adds nothing', async () => {
    vi.spyOn(poemService, 'duplicatePoem').mockRejectedValue(new Error('storage is full'));
    const { button, alertText, titles } = await show();
    click(button('Duplicate draft Old Pond'));
    await settle();
    expect(alertText()).toBe('Could not duplicate this poem. Please try again.');
    expect(titles()).toEqual(['Quiet Woods', 'Old Pond']);
  });
});
