import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY, draft, keepFirstWords, openCollection, openStudio, pageWords, passageButton, saveDraft, seedDrafts } from './helpers';

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const titles = (page: Page) => dialog(page).locator('li .font-serif').allInnerTexts();
const status = (page: Page) => dialog(page).getByRole('status');
const stored = (page: Page) =>
  page.evaluate(key => Object.values(JSON.parse(window.localStorage.getItem(key) ?? '{}')) as { title: string; notes?: string }[], STORAGE_KEY);

const seed = (page: Page) =>
  seedDrafts(page, {
    newer: draft({ id: 'newer', passageId: 'walden-woods', title: 'Quiet Woods', retainedTokenIds: ids(14, 28), lineBreaks: [ids(14, 28)[2], ids(14, 28)[9]] }),
    older: draft({ id: 'older', passageId: 'walden-woods', title: 'Old Pond', notes: 'keep me', retainedTokenIds: ids(20, 23), updatedAt: '2020-01-01T00:00:00.000Z', createdAt: '2020-01-01T00:00:00.000Z' }),
  });

test.describe('renaming a poem in My Collection', () => {
  test('opens a field with the current title, and Enter saves it, moving the poem to the top', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    expect(await titles(page)).toEqual(['Quiet Woods', 'Old Pond']);

    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    const field = dialog(page).getByLabel('New title for “Old Pond”');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Old Pond');
    await page.keyboard.type('Evening Pond'); // the title was selected, so typing replaces it
    await page.keyboard.press('Enter');

    await expect(status(page)).toHaveText('Renamed to “Evening Pond”.');
    expect(await titles(page)).toEqual(['Evening Pond', 'Quiet Woods']);
    await expect(page.getByRole('button', { name: 'Rename draft Evening Pond' })).toBeFocused();
    expect((await stored(page)).find(p => p.title === 'Evening Pond')).toMatchObject({ notes: 'keep me' });

    await page.reload();
    await openCollection(page);
    expect(await titles(page)).toEqual(['Evening Pond', 'Quiet Woods']);
  });

  test('Escape cancels the rename only, and the collection stays open', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    await page.keyboard.type('Never saved');
    await page.keyboard.press('Escape');

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('form')).toHaveCount(0);
    expect(await titles(page)).toEqual(['Quiet Woods', 'Old Pond']);
    await expect(page.getByRole('button', { name: 'Rename draft Old Pond' })).toBeFocused();
    expect((await stored(page)).map(p => p.title).sort()).toEqual(['Old Pond', 'Quiet Woods']);
  });

  test('Cancel does the same, and an empty title becomes "Untitled Poem"', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    expect(await titles(page)).toEqual(['Quiet Woods', 'Old Pond']);

    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    await dialog(page).getByLabel('New title for “Old Pond”').fill('   ');
    await dialog(page).getByRole('button', { name: 'Save name' }).click();
    expect((await titles(page))[0]).toBe('Untitled Poem');
  });

  test('stops at 120 characters and shows the count when it is close', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    const field = dialog(page).getByLabel('New title for “Old Pond”');
    await field.fill('x'.repeat(130));
    await expect(field).toHaveValue('x'.repeat(120));
    await expect(dialog(page).getByText('120/120')).toBeVisible();
  });

  test('says plainly when the browser would not store it, and keeps what was typed', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'QuotaExceededError');
      };
    });
    const field = dialog(page).getByLabel('New title for “Old Pond”');
    await field.fill('Evening Pond');
    await dialog(page).getByRole('button', { name: 'Save name' }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText('Could not rename this poem. Please try again.');
    await expect(field).toHaveValue('Evening Pond');
  });

  test('the poem open in the Studio follows the new name, and is not left with unsaved changes', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 4);
    await saveDraft(page, 'Original');
    await expect(page.getByText('Editing: "Original"')).toBeVisible();

    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Original' }).click();
    await dialog(page).getByLabel('New title for “Original”').fill('Renamed');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Renamed to “Renamed”.');
    await page.getByRole('button', { name: 'Close collection', exact: true }).click();

    await expect(page.getByText('Editing: "Renamed"')).toBeVisible();
    // The rename is saved already, so nothing is lost by switching passage...
    await passageButton(page, 'Walden').click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
  });

  test('saving the open poem afterwards keeps the new name', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 4);
    await saveDraft(page, 'Original');
    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Original' }).click();
    await dialog(page).getByLabel('New title for “Original”').fill('Renamed');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Close collection', exact: true }).click();

    await pageWords(page).nth(6).click(); // one more word
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    const save = page.getByRole('dialog', { name: 'Save Poem Draft' });
    await expect(save.getByLabel('Poem Title')).toHaveValue('Renamed'); // not the old name
    await save.getByRole('button', { name: 'Save Draft', exact: true }).click();

    expect((await stored(page)).map(p => p.title)).toEqual(['Renamed']);
  });
});

test.describe('duplicating a poem in My Collection', () => {
  test('adds a copy with "(copy)" in parentheses at the top, says so, and leaves the original alone', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Duplicate draft Old Pond' }).click();

    await expect(status(page)).toHaveText('Duplicated as “Old Pond (copy)”.');
    expect(await titles(page)).toEqual(['Old Pond (copy)', 'Quiet Woods', 'Old Pond']);
    const all = await stored(page);
    expect(all).toHaveLength(3);
    expect(all.find(p => p.title === 'Old Pond (copy)')).toMatchObject({ notes: 'keep me' });

    // The copy shows the same lines as the original.
    const previews = await dialog(page).locator('li span.font-literary').allInnerTexts();
    expect(previews[0]).toBe(previews[2]);
  });

  test('the copy opens in the Studio with the same words', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Duplicate draft Quiet Woods' }).click();
    await expect(status(page)).toHaveText('Duplicated as “Quiet Woods (copy)”.');
    await dialog(page).getByRole('button', { name: /Quiet Woods \(copy\)/ }).first().click();
    await expect(page.getByText('Loaded draft "Quiet Woods (copy)"')).toBeVisible();
    await expect(page.locator('article button[data-token-id][aria-pressed="true"]')).toHaveCount(15);
  });

  test('a double click makes one copy', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Duplicate draft Old Pond' }).dblclick();
    await expect(status(page)).toHaveText('Duplicated as “Old Pond (copy)”.');
    expect(await stored(page)).toHaveLength(3);
  });

  test('copying a copy adds another "(copy)"', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Duplicate draft Old Pond', exact: true }).click();
    await expect(status(page)).toHaveText('Duplicated as “Old Pond (copy)”.');
    await page.waitForTimeout(900); // a deliberate second click, not part of a double click
    await page.getByRole('button', { name: 'Duplicate draft Old Pond (copy)' }).click();
    await expect(status(page)).toHaveText('Duplicated as “Old Pond (copy) (copy)”.');
  });

  test('says plainly when the browser would not store it, and adds nothing', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'QuotaExceededError');
      };
    });
    await page.getByRole('button', { name: 'Duplicate draft Old Pond' }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText('Could not duplicate this poem. Please try again.');
    expect(await titles(page)).toEqual(['Quiet Woods', 'Old Pond']);
  });
});

test.describe('the actions on a phone and from the keyboard', () => {
  test('each action is at least 24 by 24 pixels, and nothing runs off the screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const small = await dialog(page).locator('li button').evaluateAll(els =>
      els
        .map(el => ({ label: el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 20), box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 24 || box.height < 24))
        .map(({ label, box }) => `${label}: ${Math.round(box.width)}x${Math.round(box.height)}`)
    );
    expect(small).toEqual([]);

    await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
    const form = dialog(page).locator('form');
    const box = (await form.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('a poem can be renamed and copied with the keyboard alone', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Old Pond' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('By keyboard');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('Renamed to “By keyboard”.');

    await page.getByRole('button', { name: 'Duplicate draft By keyboard' }).focus();
    await page.keyboard.press('Space');
    await expect(status(page)).toHaveText('Duplicated as “By keyboard (copy)”.');
    // Whoever pressed the button by keyboard is still on it, ready to press again.
    await expect(page.getByRole('button', { name: 'Duplicate draft By keyboard', exact: true })).toBeFocused();
  });
});
