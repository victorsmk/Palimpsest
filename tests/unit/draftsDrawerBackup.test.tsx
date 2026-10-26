// @vitest-environment jsdom
import { PassageLibrary } from '@/lib/library/passageLibrary';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { DraftsDrawer } from '@/components/DraftsDrawer';
import { bundledPassages } from '@/lib/library/bundled';
import { BACKUP_FORMAT, BACKUP_VERSION } from '@/lib/backup';
import { click, render } from '../helpers/react';

const download = vi.fn();
vi.mock('@/lib/export/text', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/export/text')>()),
  downloadTextFile: (...args: unknown[]) => download(...args),
}));

const STORAGE_KEY = 'palimpsest:poems:v1';
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const poem = (id: string, title: string, overrides = {}) => ({
  id, schemaVersion: 2, revision: 1, passageId: 'walden-woods', title, notes: '', retainedTokenIds: ids(14, 17), lineBreaks: [],
  erasureStyle: 'blackout', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...overrides,
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  download.mockReset();
  vi.restoreAllMocks();
});

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
    });
  }
};

async function show(stored: Record<string, unknown> = {}) {
  if (Object.keys(stored).length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  const view = render(createElement(DraftsDrawer, { isOpen: true, onClose: vi.fn(), onLoadPoem: vi.fn(), library: PassageLibrary.of(bundledPassages) }));
  await settle();
  const button = (text: string) => [...view.container.querySelectorAll('button')].find(b => b.textContent === text)!;
  const titles = () => [...view.container.querySelectorAll('li .font-serif')].map(el => el.textContent);
  const notice = () => view.container.querySelector('[role="status"]')!.textContent;
  const alertText = () => view.container.querySelector('[role="alert"]')?.textContent ?? null;
  const question = () => view.container.querySelector('[role="alertdialog"]');
  const choose = async (contents: string, name = 'backup.json') => {
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([contents], name, { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
  };
  return { ...view, button, titles, notice, alertText, question, choose };
}

const backupOf = (poems: unknown[]) => JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '2026-10-25T00:00:00.000Z', poems });
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, { title: string }>;

describe('backing up from My Collection', () => {
  it('downloads every poem as one file, and says what it did', async () => {
    const { button, notice } = await show({ a: poem('a', 'Quiet Woods'), b: poem('b', 'Old Pond') });
    click(button('Back up all poems'));
    await settle();

    expect(download).toHaveBeenCalledOnce();
    const [filename, text, mime] = download.mock.calls[0];
    expect(filename).toMatch(/^palimpsest-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mime).toBe('application/json');
    expect(JSON.parse(text as string).poems.map((p: { id: string }) => p.id).sort()).toEqual(['a', 'b']);
    expect(notice()).toBe(`Backed up 2 poems to ${filename}.`);
  });

  it('uses the singular for one poem', async () => {
    const { button, notice } = await show({ a: poem('a', 'Quiet Woods') });
    click(button('Back up all poems'));
    await settle();
    expect(notice()).toMatch(/^Backed up 1 poem to /);
  });

  it('downloads nothing, and says so, when there is nothing to back up', async () => {
    const { button, notice } = await show();
    click(button('Back up all poems'));
    await settle();
    expect(download).not.toHaveBeenCalled();
    expect(notice()).toBe('You have no poems to back up yet.');
  });
});

describe('restoring from My Collection', () => {
  it('has a button that opens the file chooser, for backup files only', async () => {
    const { container, button } = await show();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe('.json,application/json');
    expect(input.hidden).toBe(true);
    const open = vi.spyOn(input, 'click').mockImplementation(() => {});
    click(button('Restore from a backup…'));
    expect(open).toHaveBeenCalledOnce();
  });

  it('asks first, saying what is in the file, and changes nothing until told to', async () => {
    const { choose, question, titles } = await show({ a: poem('a', 'Quiet Woods') });
    await choose(backupOf([poem('a', 'Quiet Woods'), poem('b', 'Old Pond'), poem('c', 'Evening')]));

    const ask = question()!;
    expect(ask.querySelector('h2')!.textContent).toBe('Restore from this backup?');
    expect(ask.querySelector('p')!.textContent).toBe(
      'This backup has 3 poems. 2 are new and will be added. 1 is already in your collection. Nothing you already have will be changed.'
    );
    expect([...ask.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Cancel', 'Add 2 poems']);
    expect(Object.keys(stored())).toEqual(['a']);
    expect(titles()).toEqual(['Quiet Woods']);
  });

  it('adds the new poems when told to, and says how many', async () => {
    const { choose, question, button, titles, notice } = await show({ a: poem('a', 'Quiet Woods') });
    await choose(backupOf([poem('a', 'Quiet Woods'), poem('b', 'Old Pond')]));
    click(button('Add 1 poem'));
    await settle();

    expect(question()).toBeNull();
    expect(Object.keys(stored()).sort()).toEqual(['a', 'b']);
    expect(titles().sort()).toEqual(['Old Pond', 'Quiet Woods']);
    expect(notice()).toBe('Added 1 poem from the backup.');
  });

  it('leaves the collection alone when the question is cancelled, and puts focus back on Restore', async () => {
    const { choose, button, question } = await show();
    await choose(backupOf([poem('b', 'Old Pond')]));
    click(button('Cancel'));
    await settle();
    expect(question()).toBeNull();
    expect(Object.keys(stored())).toEqual([]);
    expect(document.activeElement).toBe(button('Restore from a backup…'));
  });

  it('keeps the current version of a poem that differs, and says so', async () => {
    const { choose, question } = await show({ a: poem('a', 'Changed since') });
    await choose(backupOf([poem('a', 'Original'), poem('b', 'Old Pond')]));
    expect(question()!.querySelector('p')!.textContent).toContain('1 is a different version of a poem you already have, so yours is kept.');
  });

  it('adds nothing and says why when everything is already there', async () => {
    const { choose, question, notice } = await show({ a: poem('a', 'Quiet Woods') });
    await choose(backupOf([poem('a', 'Quiet Woods')]));
    expect(question()).toBeNull();
    expect(notice()).toBe('Nothing to add. This backup has 1 poem. 1 is already in your collection.');
  });

  it('tells the reader about poems in the file that cannot be used, and adds the rest', async () => {
    const { choose, question } = await show();
    await choose(backupOf([poem('b', 'Old Pond'), { id: 'broken' }, poem('b', 'Again')]));
    expect(question()!.querySelector('p')!.textContent).toBe(
      "This backup has 3 poems. 1 is new and will be added. 1 can't be read and will be skipped. 1 is repeated in the file and will be skipped. Nothing you already have will be changed."
    );
  });

  it.each([
    ['text that is not a backup', 'hello', 'That file could not be read. It is not a Palimpsest backup.'],
    ['another kind of JSON', '{"a":1}', 'That file is not a Palimpsest backup.'],
    ['a backup from a newer version', JSON.stringify({ format: BACKUP_FORMAT, version: 99, poems: [] }), 'That backup was made by a newer version of Palimpsest, which this one cannot read.'],
  ])('refuses %s, with a plain message, and changes nothing', async (_name, contents, message) => {
    const { choose, alertText, question } = await show({ a: poem('a', 'Quiet Woods') });
    await choose(contents);
    expect(alertText()).toBe(message);
    expect(question()).toBeNull();
    expect(Object.keys(stored())).toEqual(['a']);
  });

  it('says plainly if the poems could not be stored, and leaves the collection as it was', async () => {
    const { choose, button, alertText, question } = await show({ a: poem('a', 'Quiet Woods') });
    await choose(backupOf([poem('b', 'Old Pond')]));
    const before = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    click(button('Add 1 poem'));
    await settle();
    expect(alertText()).toBe('Your browser has no room left to store this. Delete some poems, or back up and clear space, then try again. Your collection has not been changed.');
    expect(question()).not.toBeNull(); // still open, to try again
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});
