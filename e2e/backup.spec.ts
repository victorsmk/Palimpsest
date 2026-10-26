import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { STORAGE_KEY, draft, openCollection, openStudio, seedDrafts } from './helpers';

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const P = ids(14, 28);

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const question = (page: Page) => page.getByRole('alertdialog', { name: 'Restore from this backup?' });
const backUpButton = (page: Page) => dialog(page).getByRole('button', { name: 'Back up all poems' });
const restoreButton = (page: Page) => dialog(page).getByRole('button', { name: 'Restore from a backup…' });
const status = (page: Page) => dialog(page).getByRole('status');
const titles = (page: Page) => dialog(page).locator('li .font-serif').allInnerTexts();
const stored = (page: Page) =>
  page.evaluate(key => Object.values(JSON.parse(window.localStorage.getItem(key) ?? '{}')) as { id: string; title: string }[], STORAGE_KEY);

const seed = (page: Page) =>
  seedDrafts(page, {
    a: draft({ id: 'a', passageId: 'walden-woods', title: 'Quiet Woods', retainedTokenIds: P, lineBreaks: [P[2], P[9]] }),
    b: draft({ id: 'b', passageId: 'walden-woods', title: 'Old Pond', notes: 'keep me', retainedTokenIds: P.slice(6, 10), updatedAt: '2020-01-01T00:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z' }),
  });

const chooseFile = (page: Page, path: string) => dialog(page).locator('input[type="file"]').setInputFiles(path);
const chooseText = (page: Page, text: string, name = 'backup.json') =>
  dialog(page).locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });

/** Backs up and returns the file on disk. */
async function downloadBackup(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), backUpButton(page).click()]);
  return { download, path: (await download.path())! };
}

test.describe('backing up', () => {
  test('downloads one dated file holding every poem, and says so', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const { download, path } = await downloadBackup(page);

    expect(download.suggestedFilename()).toMatch(/^palimpsest-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(status(page)).toHaveText(`Backed up 2 poems to ${download.suggestedFilename()}.`);
    const file = JSON.parse(readFileSync(path, 'utf8'));
    expect(file).toMatchObject({ format: 'palimpsest-backup', version: 2 });
    expect(file.poems.map((p: { id: string }) => p.id).sort()).toEqual(['a', 'b']);
    expect(file.poems.find((p: { id: string }) => p.id === 'b')).toMatchObject({ title: 'Old Pond', notes: 'keep me' });
  });

  test('says there is nothing to back up, and downloads nothing, when the collection is empty', async ({ page }) => {
    await openStudio(page);
    await openCollection(page);
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await backUpButton(page).click();
    await expect(status(page)).toHaveText('You have no poems to back up yet.');
    expect(downloaded).toBe(false);
  });
});

test.describe('restoring', () => {
  test('brings back a whole collection from a backup after the browser has lost it', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const { path } = await downloadBackup(page);

    // The browser forgets everything.
    await page.evaluate(key => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();
    await openCollection(page);
    await expect(page.getByText('No drafts yet')).toBeVisible();

    await chooseFile(page, path);
    await expect(question(page)).toBeVisible();
    await expect(question(page)).toContainText('This backup has 2 poems. 2 are new and will be added. Nothing you already have will be changed.');
    await question(page).getByRole('button', { name: 'Add 2 poems' }).click();

    await expect(status(page)).toHaveText('Added 2 poems from the backup.');
    expect((await titles(page)).sort()).toEqual(['Old Pond', 'Quiet Woods']);
    // Each comes back as it was: its first lines, and its notes in storage.
    await expect(dialog(page).getByRole('listitem').filter({ hasText: 'Quiet Woods' })).toContainText('the essential facts');
    expect((await stored(page)).map(p => p.id).sort()).toEqual(['a', 'b']);

    await page.reload();
    await openCollection(page);
    expect((await titles(page)).sort()).toEqual(['Old Pond', 'Quiet Woods']);

    // And they open as they were.
    await dialog(page).getByRole('button', { name: /Quiet Woods/ }).first().click();
    await expect(page.locator('article button[data-token-id][aria-pressed="true"]')).toHaveCount(15);
  });

  test('restoring the same backup again adds nothing and says why', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const { path } = await downloadBackup(page);
    await chooseFile(page, path);
    await expect(status(page)).toHaveText('Nothing to add. This backup has 2 poems. 2 are already in your collection.');
    await expect(question(page)).toHaveCount(0);
    expect(await stored(page)).toHaveLength(2);
  });

  test('puts back a poem that was deleted, and leaves the others exactly as they are', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const { path } = await downloadBackup(page);

    await page.getByRole('button', { name: 'Delete draft Old Pond' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    await expect(page.getByText('Old Pond')).toHaveCount(0);

    await chooseFile(page, path);
    await expect(question(page)).toContainText('1 is new and will be added. 1 is already in your collection.');
    await question(page).getByRole('button', { name: 'Add 1 poem' }).click();
    await expect(status(page)).toHaveText('Added 1 poem from the backup.');
    expect((await titles(page)).sort()).toEqual(['Old Pond', 'Quiet Woods']);
  });

  test('keeps the current version of a poem that has changed since the backup, while adding one that is missing', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const { path } = await downloadBackup(page);

    await page.getByRole('button', { name: 'Rename draft Quiet Woods' }).click();
    await dialog(page).getByLabel('New title for “Quiet Woods”').fill('Renamed since');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Renamed to “Renamed since”.');
    await page.getByRole('button', { name: 'Delete draft Old Pond' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    await expect(page.getByRole('button', { name: 'Delete draft Old Pond' })).toHaveCount(0);

    await chooseFile(page, path);
    await expect(question(page)).toContainText('1 is new and will be added. 1 is a different version of a poem you already have, so yours is kept.');
    await question(page).getByRole('button', { name: 'Add 1 poem' }).click();
    await expect(status(page)).toHaveText('Added 1 poem from the backup.');
    expect((await titles(page)).sort()).toEqual(['Old Pond', 'Renamed since']); // the backup's "Quiet Woods" did not replace it
  });

  test('says the same when there is nothing new to add', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const { path } = await downloadBackup(page);
    await page.getByRole('button', { name: 'Rename draft Quiet Woods' }).click();
    await dialog(page).getByLabel('New title for “Quiet Woods”').fill('Renamed since');
    await page.keyboard.press('Enter');
    await chooseFile(page, path);
    await expect(status(page)).toContainText('Nothing to add.');
    await expect(status(page)).toContainText('1 is a different version of a poem you already have, so yours is kept.');
    expect((await titles(page)).sort()).toEqual(['Old Pond', 'Renamed since']);
  });

  test('can be cancelled, and the keyboard works in the question', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const { path } = await downloadBackup(page);
    await page.getByRole('button', { name: 'Delete draft Old Pond' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();

    await chooseFile(page, path);
    await expect(question(page)).toBeVisible();
    await expect(question(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await question(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(question(page)).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(restoreButton(page)).toBeFocused();
    expect(await stored(page)).toHaveLength(1); // nothing was added
  });
});

test.describe('files that are not good backups', () => {
  const cases: [string, string, string][] = [
    ['text that is not JSON', 'hello there', 'That file could not be read. It is not a Palimpsest backup.'],
    ['JSON that is not a backup', '{"poems": []}', 'That file is not a Palimpsest backup.'],
    ['a list', '[1, 2, 3]', 'That file is not a Palimpsest backup.'],
    ['an empty file', '', 'That file could not be read. It is not a Palimpsest backup.'],
    ['a backup from a newer version', JSON.stringify({ format: 'palimpsest-backup', version: 3, poems: [] }), 'That backup was made by a newer version of Palimpsest, which this one cannot read.'],
  ];

  for (const [name, contents, message] of cases) {
    test(`refuses ${name}, plainly, and changes nothing`, async ({ page }) => {
      await seed(page);
      await openStudio(page);
      await openCollection(page);
      await chooseText(page, contents);
      await expect(dialog(page).getByRole('alert')).toHaveText(message);
      await expect(question(page)).toHaveCount(0);
      expect(await stored(page)).toHaveLength(2);
    });
  }

  test('refuses a file that is far too large', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await dialog(page).locator('input[type="file"]').setInputFiles({ name: 'huge.json', mimeType: 'application/json', buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 0x20) });
    await expect(dialog(page).getByRole('alert')).toHaveText('That file is too large to be a Palimpsest backup.');
    expect(await stored(page)).toHaveLength(2);
  });

  test('adds the good poems of a backup that also holds bad ones, and says which it skipped', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const good = draft({ id: 'new-one', passageId: 'walden-woods', title: 'From the file', retainedTokenIds: P.slice(0, 3), lineBreaks: [] });
    const text = `{"format":"palimpsest-backup","version":1,"poems":[${JSON.stringify(good)},{"id":"broken"},{"id":"__proto__","schemaVersion":1,"passageId":"walden-woods","retainedTokenIds":[],"lineBreaks":[],"erasureStyle":"blackout","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"},${JSON.stringify(good)}]}`;
    await chooseText(page, text);

    await expect(question(page)).toContainText("This backup has 4 poems. 1 is new and will be added. 2 can't be read and will be skipped. 1 is repeated in the file and will be skipped.");
    await question(page).getByRole('button', { name: 'Add 1 poem' }).click();
    expect((await stored(page)).map(p => p.id).sort()).toEqual(['a', 'b', 'new-one']);
    expect(await page.evaluate(() => (({}) as Record<string, unknown>).passageId)).toBeUndefined(); // nothing leaked into every object
  });

  test('ignores fields it does not know, so a backup cannot carry anything else in', async ({ page }) => {
    await openStudio(page);
    await openCollection(page);
    const withExtras = { ...draft({ id: 'x', passageId: 'walden-woods', title: 'Plain', retainedTokenIds: P.slice(0, 3), lineBreaks: [] }), script: '<script>alert(1)</script>', nested: { deep: true } };
    await chooseText(page, JSON.stringify({ format: 'palimpsest-backup', version: 2, poems: [withExtras] }));
    await question(page).getByRole('button', { name: 'Add 1 poem' }).click();
    const raw = await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEY);
    expect(raw).not.toContain('script');
    expect(raw).not.toContain('nested');
  });

  test('leaves the collection as it was, and says so, if the browser will not store the poems', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await chooseText(page, JSON.stringify({ format: 'palimpsest-backup', version: 2, poems: [draft({ id: 'z', passageId: 'walden-woods', title: 'Z', retainedTokenIds: P.slice(0, 2), lineBreaks: [] })] }));
    await expect(question(page)).toBeVisible();
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('full', 'QuotaExceededError');
      };
    });
    await question(page).getByRole('button', { name: 'Add 1 poem' }).click();
    await expect(question(page).getByRole('alert')).toHaveText('Your browser has no room left to store this. Delete some poems, or back up and clear space, then try again. Your collection has not been changed.');
    await expect(question(page)).toBeVisible();
    expect(await stored(page)).toHaveLength(2);
  });
});

test.describe('on a phone', () => {
  test('the buttons and the question fit and can be touched', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    for (const button of [backUpButton(page), restoreButton(page)]) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
    await chooseText(page, JSON.stringify({ format: 'palimpsest-backup', version: 2, poems: [draft({ id: 'z', passageId: 'walden-woods', title: 'Z', retainedTokenIds: P.slice(0, 2), lineBreaks: [] })] }));
    const box = (await question(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
