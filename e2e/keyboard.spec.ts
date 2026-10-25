import { test, expect } from '@playwright/test';
import { keepFirstWords, openStudio, pageWords, saveDraft } from './helpers';

test.describe('keyboard only', () => {
  test('reaches the passage with Tab, moves with the arrows and toggles with Space', async ({ page }) => {
    await openStudio(page);

    // Tab through the header controls until focus lands in the passage text.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => !!document.activeElement?.closest('article'))) break;
    }
    const words = pageWords(page);
    await expect(words.first()).toBeFocused(); // the whole passage is one tab stop, at its first word
    await expect(page.locator('article button[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(words.nth(2)).toBeFocused();
    await expect(page.locator('article button[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press('Space');
    await expect(words.nth(2)).toHaveAttribute('aria-pressed', 'false');
    await expect(words.nth(2)).toBeFocused(); // focus stays put after toggling
    await expect(page.getByRole('status').filter({ hasText: 'words kept' })).toContainText(
      /\d+ words kept, 1 erased\./
    );

    await page.keyboard.press('Enter');
    await expect(words.nth(2)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('End');
    await expect(words.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(words.first()).toBeFocused();

    // One Tab leaves the passage entirely instead of walking through every word.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('article'))).toBe(false);
  });

  test('the collection drawer traps focus, closes on Escape and returns focus', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 2);
    await saveDraft(page, 'Keyboard draft');

    const opener = page.getByRole('button', { name: 'My Collection' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('the save dialog focuses the title, closes on Escape and returns focus', async ({ page }) => {
    await openStudio(page);
    const saveButton = page.getByRole('button', { name: 'Save Draft to Collection' });
    await saveButton.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Save Poem Draft' });
    await expect(dialog.getByLabel('Poem Title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(saveButton).toBeFocused();
  });
});
