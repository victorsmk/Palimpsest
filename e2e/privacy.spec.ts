import { test, expect } from '@playwright/test';

test.describe('the privacy page', () => {
  test('is reached from the home page footer, and names itself', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page).toHaveTitle('Privacy · Palimpsest');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  });

  test('says what is kept, who handles it, how to delete, and who to ask', async ({ page }) => {
    await page.goto('/privacy');
    for (const heading of ['What is kept when you sign in', 'What is not done', 'What stays in your browser', 'Who else handles it', 'Deleting your data', 'Questions']) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'butnaru.victor05@gmail.com' })).toHaveAttribute('href', 'mailto:butnaru.victor05@gmail.com');
    await expect(page.getByRole('main')).toContainText('Account → Delete my account');
    await expect(page.getByRole('main')).toContainText('they are never sent to us'); // texts the reader adds
  });

  test('does what it says about cookies: the site sets none', async ({ page, context }) => {
    await page.goto('/');
    await page.goto('/privacy');
    await page.goto('/studio');
    expect(await context.cookies()).toEqual([]);
  });

  test('has no sideways scrolling on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/privacy');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the skip link lands on its main content', async ({ page }) => {
    await page.goto('/privacy');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });
});
