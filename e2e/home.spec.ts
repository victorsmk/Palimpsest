import { test, expect } from '@playwright/test';

const POEM = 'to front only the essential facts of life, and see if I could not';

const demo = (page: import('@playwright/test').Page) => page.locator('[data-erased]');

test.describe('the home page demonstration', () => {
  test('covers every word of the sentence but the poem, which stays readable', async ({ page }) => {
    await page.goto('/');
    await expect(demo(page)).toHaveAttribute('data-erased', 'true', { timeout: 10_000 });

    const kept = await page.locator('.era-kept').allTextContents();
    expect(kept.join(' ')).toBe(POEM);

    // Covered words end up the ink colour on an ink bar, kept words the burgundy of the poem: the transitions take a few seconds.
    const colour = (selector: string) => page.locator(selector).last().evaluate(el => getComputedStyle(el).color);
    await expect.poll(() => colour('.era-kept'), { timeout: 10_000 }).toBe('rgb(108, 52, 56)');
    await expect.poll(() => colour('.era-gone'), { timeout: 10_000 }).toBe('rgb(36, 35, 31)');
    expect(await page.locator('.era-gone').count()).toBeGreaterThan(20);
  });

  test('can be watched again', async ({ page }) => {
    await page.goto('/');
    await expect(demo(page)).toHaveAttribute('data-erased', 'true', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Watch it again' }).click();
    await expect(demo(page)).toHaveAttribute('data-erased', 'false');
    await expect(demo(page)).toHaveAttribute('data-erased', 'true', { timeout: 10_000 });
  });

  test('starts from the finished poem for someone who asks for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(demo(page)).toHaveAttribute('data-erased', 'true', { timeout: 1_000 });
    const animated = await page.locator('.hero-title').evaluate(el => getComputedStyle(el).animationName);
    expect(animated).toBe('none');
  });

  test('is read aloud as the poem and where it came from, not as a sentence with most of it covered', async ({ page }) => {
    await page.goto('/');
    await expect(demo(page)).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByText('every word covered except these', { exact: false })).toContainText(POEM);
  });
});

test.describe('the home page layout', () => {
  test('has one h1, then a heading for each of the two sections', async ({ page }) => {
    await page.goto('/');
    const headings = await page.getByRole('heading').evaluateAll(els => els.map(el => [el.tagName, (el.textContent ?? '').trim()]));
    expect(headings).toEqual([
      ['H1', 'Every page of literature hides a poem waiting to be revealed.'],
      ['H2', 'Three ways in'],
      ['H2', 'Real books, borrowed from the public domain.'],
    ]);
  });

  test('does not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
  });

  test('has pictures that are described or left silent, and credits for each of them', async ({ page }) => {
    await page.goto('/');
    const images = await page.locator('main img, section img').evaluateAll(els => els.map(el => el.getAttribute('alt')));
    expect(images.every(alt => alt !== null)).toBe(true);
    await page.getByText('Picture credits').click();
    for (const name of ['King’s Library', 'The Raven', 'Songs of Innocence', 'chained book']) {
      await expect(page.getByRole('link', { name: new RegExp(name, 'i') }).last()).toBeVisible();
    }
  });
});
