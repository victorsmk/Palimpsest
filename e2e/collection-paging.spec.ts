import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY, draft, keptWords, openCollection, openStudio, seedDrafts } from './helpers';

// A long collection is shown a page at a time, from summaries; a poem is fetched whole when it is chosen.

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const stamp = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();

/** `count` poems changed one second apart: "Poem 000" the oldest, so the newest is listed first. */
const collection = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => {
      const id = `p${String(i).padStart(3, '0')}`;
      return [id, draft({ id, passageId: 'walden-woods', title: `Poem ${String(i).padStart(3, '0')}`, notes: `notes ${i}`, retainedTokenIds: ids(14, 24), lineBreaks: [ids(14, 24)[3]], createdAt: stamp(0), updatedAt: stamp(i) })];
    })
  );

const panel = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const cards = (page: Page) => panel(page).getByRole('listitem');
const more = (page: Page) => panel(page).getByRole('button', { name: 'Show more poems' });

test.describe('a collection of more poems than fit on a page', () => {
  test('shows the most recent 100, then more when asked, and the button goes when there is no more', async ({ page }) => {
    await seedDrafts(page, collection(130));
    await openStudio(page);
    await openCollection(page);
    await expect(cards(page)).toHaveCount(100);
    await expect(cards(page).first()).toContainText('Poem 129');
    await expect(cards(page).last()).toContainText('Poem 030');

    await more(page).click();
    await expect(cards(page)).toHaveCount(130);
    await expect(cards(page).last()).toContainText('Poem 000');
    await expect(panel(page).getByRole('status').filter({ hasText: 'Showing 30 more poems.' })).toBeVisible();
    await expect(more(page)).toHaveCount(0);
    // Focus is not left on a button that is gone.
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName)).not.toBe('BODY');
  });

  test('has no button for a collection that fits on one page', async ({ page }) => {
    await seedDrafts(page, collection(100));
    await openStudio(page);
    await openCollection(page);
    await expect(cards(page)).toHaveCount(100);
    await expect(more(page)).toHaveCount(0);
  });

  test('every card has its book and first lines, on the first page and on later ones', async ({ page }) => {
    await seedDrafts(page, collection(105));
    await openStudio(page);
    await openCollection(page);
    await expect(cards(page).first()).toContainText('From Walden');
    await expect(cards(page).first()).toContainText('the essential facts');
    await more(page).click();
    await expect(cards(page)).toHaveCount(105);
    await expect(cards(page).last()).toContainText('From Walden');
    await expect(cards(page).last()).toContainText('the essential facts');
  });

  test('a poem from a later page opens whole, with its notes and its words', async ({ page }) => {
    await seedDrafts(page, collection(130));
    await openStudio(page);
    await openCollection(page);
    await more(page).click();
    await expect(cards(page)).toHaveCount(130);
    await panel(page).getByRole('button', { name: /Poem 002/ }).first().click();
    await expect(page.getByText('Editing: "Poem 002"')).toBeVisible();
    await expect(keptWords(page)).toHaveCount(11);
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await expect(page.getByRole('dialog', { name: 'Save Poem Draft' }).getByLabel(/Notes/)).toHaveValue('notes 2');
  });

  test('keeps what is shown after a change: renaming and deleting do not send the list back to the first page', async ({ page }) => {
    await seedDrafts(page, collection(130));
    await openStudio(page);
    await openCollection(page);
    await more(page).click();
    await expect(cards(page)).toHaveCount(130);

    await page.getByRole('button', { name: 'Rename draft Poem 050' }).click();
    await panel(page).getByLabel('New title for “Poem 050”').fill('Renamed 050');
    await page.keyboard.press('Enter');
    await expect(panel(page).getByRole('status').filter({ hasText: 'Renamed to “Renamed 050”.' })).toBeVisible();
    await expect(cards(page)).toHaveCount(130);
    await expect(cards(page).first()).toContainText('Renamed 050'); // a change puts it first

    await page.getByRole('button', { name: 'Delete draft Poem 003' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    await expect(cards(page)).toHaveCount(129);
    await expect(more(page)).toHaveCount(0);
  });

  test('a poem deleted elsewhere is reported when it is chosen, and the list is made again', async ({ page }) => {
    await seedDrafts(page, collection(5));
    await openStudio(page);
    await openCollection(page);
    await page.evaluate(key => {
      const all = JSON.parse(window.localStorage.getItem(key)!);
      delete all.p003;
      window.localStorage.setItem(key, JSON.stringify(all));
    }, STORAGE_KEY);
    await panel(page).getByRole('button', { name: /Poem 003/ }).first().click();
    await expect(panel(page).getByRole('alert').filter({ hasText: 'That poem is no longer in your collection.' })).toBeVisible();
    await expect(cards(page)).toHaveCount(4);
    await expect(panel(page)).toBeVisible();
  });
});
