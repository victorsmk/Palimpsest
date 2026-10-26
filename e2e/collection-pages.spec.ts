import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY, draft, keptWords, pageWords, passageButton, seedDrafts } from './helpers';

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const P = ids(14, 28);

const seed = (page: Page) =>
  seedDrafts(page, {
    a: draft({ id: 'a', passageId: 'walden-woods', title: 'Quiet Woods', retainedTokenIds: P, lineBreaks: [P[2], P[9]] }),
    b: draft({ id: 'b', passageId: 'walden-woods', title: 'Old Pond', notes: 'keep me', retainedTokenIds: P.slice(6, 10), updatedAt: '2020-01-01T00:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z' }),
  });

const PAGES = [
  { name: 'the home page', path: '/', ready: (p: Page) => p.getByRole('heading', { level: 1 }).first() },
  { name: 'Discover', path: '/discover', ready: (p: Page) => p.getByRole('article').first() },
  { name: 'Assisted', path: '/assist', ready: (p: Page) => p.getByRole('article').first() },
] as const;

const collectionButton = (page: Page) => page.getByRole('button', { name: 'My Collection' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const studioPage = (page: Page) => page.getByRole('article', { name: /Passage text/ });
const stored = (page: Page) => page.evaluate(key => Object.values(JSON.parse(window.localStorage.getItem(key) ?? '{}')) as { id: string; title: string; notes?: string }[], STORAGE_KEY);

async function openPanel(page: Page, path: string, ready: (p: Page) => ReturnType<Page['locator']>) {
  await page.goto(path);
  await expect(ready(page)).toBeVisible();
  await expect(collectionButton(page)).toBeEnabled();
  await collectionButton(page).click();
  await expect(panel(page)).toBeVisible();
}

for (const { name, path, ready } of PAGES) {
  test.describe(`My Collection on ${name}`, () => {
    test('opens the same panel, with each poem\'s book and first lines', async ({ page }) => {
      await seed(page);
      await openPanel(page, path, ready);
      await expect(panel(page).getByRole('listitem')).toHaveCount(2);
      const first = panel(page).getByRole('listitem').filter({ hasText: 'Quiet Woods' });
      await expect(first).toContainText('From Walden');
      await expect(first).toContainText('the essential facts');
    });

    test('says so when there is nothing saved yet', async ({ page }) => {
      await openPanel(page, path, ready);
      await expect(page.getByText('No drafts yet')).toBeVisible();
    });

    test('closes on Escape and gives focus back to the button', async ({ page }) => {
      await seed(page);
      await page.goto(path);
      await expect(ready(page)).toBeVisible();
      await expect(collectionButton(page)).toBeEnabled();
      await collectionButton(page).focus();
      await page.keyboard.press('Enter');
      await expect(panel(page)).toBeVisible();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        expect(await panel(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(panel(page)).toHaveCount(0);
      await expect(collectionButton(page)).toBeFocused();
    });

    test('opens a saved poem in the Studio, as the poem it is, with its notes', async ({ page }) => {
      await seed(page);
      await openPanel(page, path, ready);
      await panel(page).getByRole('button', { name: /Old Pond/ }).first().click();

      await expect(page).toHaveURL(/\/studio$/);
      await expect(studioPage(page)).toBeVisible();
      await expect(page.getByText('Editing: "Old Pond"')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Loaded draft "Old Pond"' })).toBeVisible();
      await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
      await expect(keptWords(page)).toHaveCount(4);
      expect(await page.evaluate(() => window.location.hash)).toBe('');

      // Saving updates this poem: same id, same notes, nothing added.
      await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
      const save = page.getByRole('dialog', { name: 'Save Poem Draft' });
      await expect(save.getByLabel('Poem Title')).toHaveValue('Old Pond');
      await expect(save.getByLabel(/Notes/)).toHaveValue('keep me');
      await save.getByRole('button', { name: 'Save Draft', exact: true }).click();
      await expect(page.getByText('Draft "Old Pond" saved.')).toBeVisible();
      const all = await stored(page);
      expect(all.map(p => p.id).sort()).toEqual(['a', 'b']);
      expect(all.find(p => p.id === 'b')).toMatchObject({ title: 'Old Pond', notes: 'keep me' });
    });

    test('the Back button returns to the page it came from', async ({ page }) => {
      await seed(page);
      await openPanel(page, path, ready);
      await panel(page).getByRole('button', { name: /Quiet Woods/ }).first().click();
      await expect(studioPage(page)).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}`));
      await expect(ready(page)).toBeVisible();
    });
  });
}

test.describe('managing the collection from another page', () => {
  test('rename, duplicate and delete work on Discover', async ({ page }) => {
    await seed(page);
    await openPanel(page, '/discover', PAGES[1].ready);

    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    await panel(page).getByLabel('New title for “Old Pond”').fill('Evening Pond');
    await page.keyboard.press('Enter');
    await expect(panel(page).getByRole('status')).toHaveText('Renamed to “Evening Pond”.');

    await page.getByRole('button', { name: 'Duplicate draft Quiet Woods' }).click();
    await expect(panel(page).getByRole('status')).toHaveText('Duplicated as “Quiet Woods (copy)”.');
    expect(await stored(page)).toHaveLength(3);

    await page.getByRole('button', { name: 'Delete draft Quiet Woods (copy)' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    await expect(panel(page).getByRole('listitem')).toHaveCount(2);
    expect((await stored(page)).map(p => p.title).sort()).toEqual(['Evening Pond', 'Quiet Woods']);
  });

  test('back up and restore work on Assisted', async ({ page }) => {
    await seed(page);
    await openPanel(page, '/assist', PAGES[2].ready);
    const [download] = await Promise.all([page.waitForEvent('download'), panel(page).getByRole('button', { name: 'Back up all poems' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^palimpsest-backup-/);

    await page.getByRole('button', { name: 'Delete draft Old Pond' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    await expect(panel(page).getByRole('listitem')).toHaveCount(1);

    await panel(page).locator('input[type="file"]').setInputFiles((await download.path())!);
    await page.getByRole('alertdialog', { name: 'Restore from this backup?' }).getByRole('button', { name: 'Add 1 poem' }).click();
    await expect(panel(page).getByRole('listitem')).toHaveCount(2);
  });
});

test.describe('a link to a saved poem', () => {
  test('opens it straight away, with no flash of the default page, then clears itself', async ({ page }) => {
    await seed(page);
    await page.goto('/studio#open=a');
    await expect(page.getByText('Editing: "Quiet Woods"')).toBeVisible();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(15);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
    // A reload starts fresh instead of opening it again.
    await page.reload();
    await expect(studioPage(page)).toBeVisible();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
  });

  const refused: [string, string, RegExp][] = [
    ['a poem that is not in the collection', 'open=gone', /That poem is no longer in your collection/],
    ['an id with a path in it', 'open=../../etc/passwd', /does not describe a poem the Studio can open/],
    ['an id that is a property of every object', 'open=__proto__', /does not describe a poem the Studio can open/],
    ['an id with markup', 'open=%3Cimg%20src=x%3E', /does not describe a poem the Studio can open/],
  ];
  for (const [name, hash, message] of refused) {
    test(`refuses ${name} and leaves the Studio as it was`, async ({ page }) => {
      await seed(page);
      await page.goto(`/studio#${hash}`);
      await expect(studioPage(page)).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
      await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
      await expect(keptWords(page)).toHaveCount(237);
      expect(await page.evaluate(() => window.location.hash)).toBe('');
    });
  }

  test('refuses a poem that no longer matches its book, and leaves it in storage untouched', async ({ page }) => {
    await seedDrafts(page, { stale: draft({ id: 'stale', passageId: 'walden-woods', title: 'Stale', retainedTokenIds: ['walden-woods-token-9999'], lineBreaks: [] }) });
    await page.goto('/studio#open=stale');
    await expect(page.getByRole('alert').filter({ hasText: '"Stale" no longer matches the current text of its passage' })).toBeVisible();
    await expect(keptWords(page)).toHaveCount(237);
    expect((await stored(page)).map(p => p.id)).toEqual(['stale']);
  });

  test('followed while the Studio is open with unsaved changes, it asks first', async ({ page }) => {
    await seed(page);
    await page.goto('/studio');
    await expect(studioPage(page)).toBeVisible();
    await pageWords(page).first().click();
    await page.evaluate(() => { window.location.hash = '#open=a'; });
    await expect(page.getByRole('alertdialog', { name: 'Discard your unsaved changes?' })).toContainText('Opening “Quiet Woods” will replace the poem you are editing');
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(keptWords(page)).toHaveCount(236);

    await page.evaluate(() => { window.location.hash = '#open=a'; });
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByText('Editing: "Quiet Woods"')).toBeVisible();
    await expect(keptWords(page)).toHaveCount(15);
  });
});

test.describe('on a phone', () => {
  for (const { name, path, ready } of PAGES) {
    test(`${name}: the button and the panel fit and can be touched`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seed(page);
      await page.goto(path);
      await expect(ready(page)).toBeVisible();
      await expect(collectionButton(page)).toBeEnabled();
      const box = (await collectionButton(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.height).toBeGreaterThanOrEqual(24);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

      await collectionButton(page).click();
      await expect(panel(page)).toBeVisible();
      const panelBox = (await panel(page).boundingBox())!;
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(390);
    });
  }
});
