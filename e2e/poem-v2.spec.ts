import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY, draft, keepFirstWords, keptWords, openCollection, openStudio, passageButton, saveDraft } from './helpers';

// Poems saved by the first version of the app, and what becomes of them. The ids below are the ones that
// version made; the new ids are fixed by tests/unit/poemV2.test.ts (they are worked out from the old ones).
const OLD_A = 'poem-1761390000000-k3j9a';
const NEW_A = '6ec0899d-aaca-5a77-9b3f-6407e2150a2f';
const OLD_B = 'poem-1761390001111-p0q1r';
const NEW_B = '98090ef7-e34e-54f7-9751-1162fe0ac8ba';
const WALDEN_VERSION = 't1-ef42d4304c54bef5';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const P = ids(14, 28);

/** A poem exactly as version 1 stored it. */
const v1 = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id, schemaVersion: 1, passageId: 'walden-woods', title, notes: 'old notes', retainedTokenIds: P, lineBreaks: [P[2], P[9]],
  erasureStyle: 'blackout', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...overrides,
});

const seedLegacy = (page: Page) =>
  page.addInitScript(
    ({ key, value }) => {
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem(key, JSON.stringify(value));
        window.sessionStorage.setItem('__seeded', '1');
      }
    },
    { key: STORAGE_KEY, value: { [OLD_A]: v1(OLD_A, 'Quiet Woods'), [OLD_B]: v1(OLD_B, 'Old Pond', { retainedTokenIds: P.slice(6, 10), lineBreaks: [] }) } }
  );

const panel = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const studioPage = (page: Page) => page.getByRole('article', { name: /Passage text/ });
const stored = (page: Page) =>
  page.evaluate(key => JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, Record<string, unknown>>, STORAGE_KEY);

test.describe('poems saved by the first version of the app', () => {
  test('are all there, with their book and first lines, and nothing is written just by looking', async ({ page }) => {
    await seedLegacy(page);
    await openStudio(page);
    await openCollection(page);
    await expect(panel(page).getByRole('listitem')).toHaveCount(2);
    const first = panel(page).getByRole('listitem').filter({ hasText: 'Quiet Woods' });
    await expect(first).toContainText('From Walden');
    await expect(first).toContainText('the essential facts');

    const raw = await stored(page);
    expect(Object.keys(raw).sort()).toEqual([OLD_A, OLD_B].sort()); // still stored as they were
    expect(Object.values(raw).every(p => p.schemaVersion === 1)).toBe(true);
  });

  test('open from My Collection, and saving them stores the whole collection in the new form', async ({ page }) => {
    await seedLegacy(page);
    await openStudio(page);
    await openCollection(page);
    await panel(page).getByRole('button', { name: /Quiet Woods/ }).first().click();
    await expect(page.getByText('Editing: "Quiet Woods"')).toBeVisible();
    await expect(keptWords(page)).toHaveCount(15);

    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    const save = page.getByRole('dialog', { name: 'Save Poem Draft' });
    await expect(save.getByLabel(/Notes/)).toHaveValue('old notes');
    await save.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.getByText('Draft "Quiet Woods" saved.')).toBeVisible();

    const raw = await stored(page);
    expect(Object.keys(raw).sort()).toEqual([NEW_A, NEW_B].sort()); // the old ids are gone
    expect(raw[OLD_A]).toBeUndefined();
    expect(raw[NEW_A]).toMatchObject({ schemaVersion: 2, revision: 2, title: 'Quiet Woods', notes: 'old notes', passageVersion: WALDEN_VERSION });
    expect(raw[NEW_B]).toMatchObject({ schemaVersion: 2, revision: 1, title: 'Old Pond' });
    expect('passageVersion' in raw[NEW_B]).toBe(false); // not saved from the Studio, so nothing is claimed

    await page.reload();
    await openCollection(page);
    await expect(panel(page).getByRole('listitem')).toHaveCount(2);
  });

  test('a link to one uses its new id; its old id no longer names it', async ({ page }) => {
    await seedLegacy(page);
    await page.goto(`/studio#open=${NEW_A}`);
    await expect(page.getByText('Editing: "Quiet Woods"')).toBeVisible();
    await expect(keptWords(page)).toHaveCount(15);

    await page.goto(`/studio#open=${OLD_A}`);
    await expect(page.getByRole('alert').filter({ hasText: 'That poem is no longer in your collection.' })).toBeVisible();
  });

  test('can be renamed, copied and deleted like any other', async ({ page }) => {
    await seedLegacy(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    await panel(page).getByLabel('New title for “Old Pond”').fill('Evening Pond');
    await page.keyboard.press('Enter');
    await expect(panel(page).getByRole('status')).toHaveText('Renamed to “Evening Pond”.');
    await page.getByRole('button', { name: 'Duplicate draft Quiet Woods' }).click();
    await expect(panel(page).getByRole('status')).toHaveText('Duplicated as “Quiet Woods (copy)”.');

    const raw = await stored(page);
    expect(Object.keys(raw)).toHaveLength(3);
    expect(Object.keys(raw).every(id => UUID.test(id))).toBe(true);
    expect(raw[NEW_B]).toMatchObject({ title: 'Evening Pond', revision: 2 });
    const copy = Object.values(raw).find(p => p.title === 'Quiet Woods (copy)')!;
    expect(copy).toMatchObject({ revision: 1, notes: 'old notes' });

    await page.getByRole('button', { name: 'Delete draft Quiet Woods (copy)' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    expect(Object.keys(await stored(page))).toHaveLength(2);
  });

  test('come back from a backup made by the first version, without adding twice', async ({ page }) => {
    await openStudio(page);
    await openCollection(page);
    const file = JSON.stringify({ format: 'palimpsest-backup', version: 1, exportedAt: '2026-10-01T00:00:00.000Z', poems: [v1(OLD_A, 'Quiet Woods'), v1(OLD_B, 'Old Pond')] });
    await panel(page).locator('input[type="file"]').setInputFiles({ name: 'old-backup.json', mimeType: 'application/json', buffer: Buffer.from(file) });
    await page.getByRole('alertdialog', { name: 'Restore from this backup?' }).getByRole('button', { name: 'Add 2 poems' }).click();
    await expect(panel(page).getByRole('listitem')).toHaveCount(2);
    expect(Object.keys(await stored(page)).sort()).toEqual([NEW_A, NEW_B].sort());

    await panel(page).locator('input[type="file"]').setInputFiles({ name: 'old-backup.json', mimeType: 'application/json', buffer: Buffer.from(file) });
    await expect(panel(page).getByRole('status')).toContainText('Nothing to add. This backup has 2 poems. 2 are already in your collection.');
    expect(await stored(page)).toBeDefined();
  });
});

test.describe('a new poem', () => {
  test('gets an id of the same kind as every poem, revision 1, and the version of the text it was made from', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await keepFirstWords(page, 5);
    await saveDraft(page, 'Brand new');
    await expect(page.getByText('Draft "Brand new" saved.')).toBeVisible();

    const entries = Object.entries(await stored(page));
    expect(entries).toHaveLength(1);
    const [id, poem] = entries[0];
    expect(id).toMatch(UUID);
    expect(poem).toMatchObject({ id, schemaVersion: 2, revision: 1, passageId: 'walden-woods', passageVersion: WALDEN_VERSION });
  });

  test('is saved as the next revision each time it is saved again', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 3);
    await saveDraft(page, 'Again and again');
    await expect(page.getByText('Draft "Again and again" saved.')).toBeVisible();
    await saveDraft(page, 'Again and again');
    await expect.poll(async () => Object.values(await stored(page))[0]?.revision).toBe(2);
    expect(Object.keys(await stored(page))).toHaveLength(1);
  });
});

test.describe('a poem made from a book whose text has since changed', () => {
  const stale = () => draft({ id: 'stale', passageId: 'walden-woods', title: 'Stale', retainedTokenIds: P, lineBreaks: [], passageVersion: 't1-0000000000000000' });
  const seedStale = (page: Page) =>
    page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, JSON.stringify(value));
      },
      { key: STORAGE_KEY, value: { stale: stale() } }
    );
  const message = '"Stale" was made from an earlier version of this text, which has since changed, so it cannot be opened safely.';

  test('is refused from My Collection, with that message, and left in storage as it was', async ({ page }) => {
    await seedStale(page);
    await openStudio(page);
    await openCollection(page);
    await panel(page).getByRole('button', { name: /Stale/ }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(237);
    expect((await stored(page)).stale).toMatchObject({ passageVersion: 't1-0000000000000000', title: 'Stale' });
  });

  test('is refused by a link, with the same message', async ({ page }) => {
    await seedStale(page);
    await page.goto('/studio#open=stale');
    await expect(studioPage(page)).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(keptWords(page)).toHaveCount(237);
  });
});
