import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY, draft, openCollection, openStudio, seedDrafts } from './helpers';

// Walden's first poem to find, "the essential facts / of life, and see if I could / not learn what it had":
// the fifteen words at positions 14 to 28, with a line break after words 16 and 23.
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const WALDEN_POEM = ids(14, 28);
const THREE_LINES = [WALDEN_POEM[2], WALDEN_POEM[9]]; // after "facts" and "could"
const FOUR_LINES = [...THREE_LINES, WALDEN_POEM[12]]; // and after "what"

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const confirm = (page: Page, name: string) => page.getByRole('alertdialog', { name: `Delete “${name}”?` });
const card = (page: Page, name: string) => dialog(page).getByRole('listitem').filter({ hasText: name });

test.describe('a poem in My Collection', () => {
  test('names its book and shows its first three lines as written', async ({ page }) => {
    await seedDrafts(page, {
      a: draft({ id: 'a', passageId: 'walden-woods', title: 'Quiet Woods', retainedTokenIds: WALDEN_POEM, lineBreaks: THREE_LINES }),
    });
    await openStudio(page);
    await openCollection(page);

    const quiet = card(page, 'Quiet Woods');
    await expect(quiet).toContainText('From Walden');
    await expect(quiet).not.toContainText('walden-woods'); // not the library's code for it
    const open = quiet.getByRole('button').first();
    const lines = await open.locator('span.font-literary > span').allInnerTexts();
    expect(lines.map(l => l.trim())).toEqual(['the essential facts', 'of life, and see if I could', 'not learn what it had']);
    await expect(quiet).toContainText('15 words');
  });

  test('cuts a longer poem after three lines and shows that there is more', async ({ page }) => {
    await seedDrafts(page, {
      a: draft({ id: 'a', passageId: 'walden-woods', title: 'Long', retainedTokenIds: WALDEN_POEM, lineBreaks: FOUR_LINES }),
    });
    await openStudio(page);
    await openCollection(page);
    const open = card(page, 'Long').getByRole('button').first();
    const lines = (await open.locator('span.font-literary > span').allInnerTexts()).map(l => l.trim());
    expect(lines).toEqual(['the essential facts', 'of life, and see if I could', 'not learn what', '…']);
  });

  test('tells poems with the same title apart by what they say', async ({ page }) => {
    await seedDrafts(page, {
      a: draft({ id: 'a', passageId: 'walden-woods', title: 'Untitled Poem', retainedTokenIds: WALDEN_POEM.slice(0, 3), lineBreaks: [] }),
      b: draft({ id: 'b', passageId: 'walden-woods', title: 'Untitled Poem', retainedTokenIds: WALDEN_POEM.slice(3, 6), lineBreaks: [], updatedAt: '2020-01-01T00:00:00.000Z' }),
    });
    await openStudio(page);
    await openCollection(page);
    const texts = await dialog(page).getByRole('listitem').allInnerTexts();
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('the essential facts');
    expect(texts[1]).toContain('of life, and');
  });

  test('still opens as before when clicked', async ({ page }) => {
    await seedDrafts(page, {
      a: draft({ id: 'a', passageId: 'walden-woods', title: 'Quiet Woods', retainedTokenIds: WALDEN_POEM, lineBreaks: THREE_LINES }),
    });
    await openStudio(page);
    await openCollection(page);
    await card(page, 'Quiet Woods').getByRole('button').first().click();
    await expect(page.getByText('Editing: "Quiet Woods"')).toBeVisible();
    await expect(page.locator('article button[data-token-id][aria-pressed="true"]')).toHaveCount(15);
  });
});

test.describe('deleting a poem from My Collection', () => {
  const seed = (page: Page) =>
    seedDrafts(page, {
      a: draft({ id: 'a', passageId: 'walden-woods', title: 'Doomed', retainedTokenIds: WALDEN_POEM, lineBreaks: THREE_LINES }),
      b: draft({ id: 'b', passageId: 'walden-woods', title: 'Kept', retainedTokenIds: WALDEN_POEM.slice(0, 4), lineBreaks: [], updatedAt: '2020-01-01T00:00:00.000Z' }),
    });
  const stored = (page: Page) => page.evaluate(key => Object.keys(JSON.parse(window.localStorage.getItem(key) ?? '{}')), STORAGE_KEY);

  test('asks first, naming the poem, in a dialog of the app\'s own, with Cancel focused', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Delete draft Doomed' }).click();

    const ask = confirm(page, 'Doomed');
    await expect(ask).toBeVisible();
    await expect(ask).toContainText("This poem will be removed from your collection. This can't be undone.");
    await expect(ask.getByRole('button', { name: 'Cancel' })).toBeFocused(); // Enter by reflex deletes nothing
    expect(await stored(page)).toEqual(expect.arrayContaining(['a', 'b'])); // nothing is deleted yet
  });

  test('Cancel keeps the poem and puts focus back on its Delete button', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Delete draft Doomed' }).click();
    await confirm(page, 'Doomed').getByRole('button', { name: 'Cancel' }).click();

    await expect(confirm(page, 'Doomed')).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete draft Doomed' })).toBeFocused();
    expect(await stored(page)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  test('Escape cancels the question only, not the collection behind it', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Delete draft Doomed' }).click();
    await expect(confirm(page, 'Doomed')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(confirm(page, 'Doomed')).toHaveCount(0);
    await expect(dialog(page)).toBeVisible();
    await expect(card(page, 'Doomed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete draft Doomed' })).toBeFocused();
  });

  test('Delete poem removes it for good and leaves the others, with focus kept inside the collection', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Delete draft Doomed' }).click();
    await confirm(page, 'Doomed').getByRole('button', { name: 'Delete poem' }).click();

    await expect(confirm(page, 'Doomed')).toHaveCount(0);
    await expect(card(page, 'Doomed')).toHaveCount(0);
    await expect(card(page, 'Kept')).toBeVisible();
    await expect(dialog(page)).toBeFocused();
    expect(await stored(page)).toEqual(['b']);

    await page.reload();
    await openCollection(page);
    await expect(card(page, 'Doomed')).toHaveCount(0);
    await expect(card(page, 'Kept')).toBeVisible();
  });

  test('can be done entirely with the keyboard, and Tab stays inside the question', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    const del = page.getByRole('button', { name: 'Delete draft Doomed' });
    await del.focus();
    await page.keyboard.press('Enter');
    const ask = confirm(page, 'Doomed');
    await expect(ask).toBeVisible();

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await ask.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await ask.evaluate(node => node.contains(document.activeElement))).toBe(true);

    await ask.getByRole('button', { name: 'Delete poem' }).focus();
    await page.keyboard.press('Enter');
    await expect(card(page, 'Doomed')).toHaveCount(0);
    expect(await stored(page)).toEqual(['b']);
  });

  test('the question and its buttons fit and can be touched on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Delete draft Doomed' }).click();
    const ask = confirm(page, 'Doomed');
    await expect(ask).toBeVisible();

    const box = (await ask.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    for (const name of ['Cancel', 'Delete poem']) {
      const button = (await ask.getByRole('button', { name }).boundingBox())!;
      expect(button.width).toBeGreaterThanOrEqual(24);
      expect(button.height).toBeGreaterThanOrEqual(24);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('says plainly if the poem could not be deleted, and keeps the question open', async ({ page }) => {
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await page.getByRole('button', { name: 'Delete draft Doomed' }).click();
    // The browser refuses to change storage, as it can when it is full or blocked.
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'QuotaExceededError');
      };
      Storage.prototype.removeItem = () => {
        throw new DOMException('blocked', 'QuotaExceededError');
      };
    });
    await confirm(page, 'Doomed').getByRole('button', { name: 'Delete poem' }).click();

    await expect(confirm(page, 'Doomed').getByRole('alert')).toHaveText('Your browser has no room left to store this. Delete some poems, or back up and clear space, then try again.');
    await expect(card(page, 'Doomed')).toBeVisible();
  });
});
