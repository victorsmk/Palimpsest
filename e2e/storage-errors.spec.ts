import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY, draft, keepFirstWords, keptWords, openCollection, openStudio, saveDraft, seedDrafts } from './helpers';

// What the writer is told when the browser will not store a poem, by why. (Running out of room is also
// checked where each action is tested: collection.spec, collection-actions.spec, backup.spec, studio.spec.)

const FULL = 'Your browser has no room left to store this. Delete some poems, or back up and clear space, then try again.';
const BLOCKED = 'Your browser is not letting this site store anything, for example in a private window. Your poem has not been saved.';
const OTHER = 'Your browser could not store this, so nothing was saved. Please try again.';

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const seed = (page: Page) => seedDrafts(page, { a: draft({ id: 'a', passageId: 'walden-woods', title: 'Old Pond', retainedTokenIds: ids(14, 20) }) });

/** Makes every write to the poems fail the way the browser fails them, once the page has loaded. */
const failWith = (page: Page, name: string) =>
  page.evaluate(
    ([key, errorName]) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (item: string, value: string) {
        if (item === key) {
          if (errorName === 'generic') throw new Error('disk on fire');
          throw new DOMException('refused', errorName);
        }
        return original.call(this, item, value);
      };
    },
    [STORAGE_KEY, name]
  );

const panel = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const saveForm = (page: Page) => page.getByRole('dialog', { name: 'Save Poem Draft' });

for (const [why, name, message] of [
  ['full', 'QuotaExceededError', FULL],
  ['blocked', 'SecurityError', BLOCKED],
  ['failed for another reason', 'generic', OTHER],
] as const) {
  test.describe(`when the browser's storage is ${why}`, () => {
    test('saving says so in the save form, keeps it open, and the words stay', async ({ page }) => {
      await openStudio(page);
      await keepFirstWords(page, 3);
      await failWith(page, name);
      await saveDraft(page, 'Will not fit');
      await expect(saveForm(page).getByRole('alert')).toHaveText(message);
      await expect(saveForm(page).getByLabel('Poem Title')).toHaveValue('Will not fit');
      await saveForm(page).getByRole('button', { name: 'Cancel' }).click();
      await expect(keptWords(page)).toHaveCount(3);
      expect(await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
    });

    test('renaming says so in the collection, and keeps what was typed', async ({ page }) => {
      await seed(page);
      await openStudio(page);
      await openCollection(page);
      await page.getByRole('button', { name: 'Rename draft Old Pond' }).click();
      await failWith(page, name);
      const field = panel(page).getByLabel('New title for “Old Pond”');
      await field.fill('Evening Pond');
      await panel(page).getByRole('button', { name: 'Save name' }).click();
      await expect(panel(page).getByRole('alert')).toHaveText(message);
      await expect(field).toHaveValue('Evening Pond');
    });
  });
}

test.describe('the error classes reach the screen as they are', () => {
  test('a storage error that is not a quota or security error says it could be tried again', async ({ page }) => {
    // A DOMException of another kind is still a failure of the browser's storage.
    await seed(page);
    await openStudio(page);
    await openCollection(page);
    await failWith(page, 'InvalidStateError');
    await page.getByRole('button', { name: 'Duplicate draft Old Pond' }).click();
    await expect(panel(page).getByRole('alert')).toHaveText(OTHER);
  });
});
