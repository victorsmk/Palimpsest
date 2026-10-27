import { test, expect, type Page } from '@playwright/test';
import { openStudio, pageWords, passageButton, styleButton } from './helpers';

// Erasing a word draws an ink bar across it, and restoring it draws the bar back (blackout and whiteout), or fades it
// (faded ink). Nothing animates when a page is opened, and nothing when the visitor asks for less motion.

/** Clicks the word, and says which of its properties are being transitioned a moment later. */
async function toggle(page: Page, index: number): Promise<string[]> {
  return pageWords(page).nth(index).evaluate(async word => {
    (word as HTMLElement).click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return word.getAnimations().map(a => (a as CSSTransition).transitionProperty).filter(Boolean);
  });
}

/** The size of the first background layer of the word: how far its ink bar is drawn across it. */
const bar = (page: Page, index: number) => pageWords(page).nth(index).evaluate(word => getComputedStyle(word).backgroundSize.split(', ')[0].split(' ')[0]);
const isErased = async (page: Page, index: number) => (await pageWords(page).nth(index).getAttribute('data-erased')) === 'true';

async function open(page: Page) {
  await openStudio(page);
  await passageButton(page, 'Walden').click();
  await expect(pageWords(page).first()).toBeVisible();
}

test.describe('ink on the page', () => {
  test('erasing a word sweeps a bar across it, and restoring it draws the bar back', async ({ page }) => {
    await open(page);
    for (let round = 0; round < 2; round++) {
      const wasErased = await isErased(page, 8);
      expect(await toggle(page, 8)).toContain('background-size');
      // When it has settled: a bar all the way across an erased word, none on a kept one, and the letters clear under it.
      await expect.poll(() => bar(page, 8), { timeout: 3000 }).toMatch(wasErased ? /^0%$/ : /^(100%|calc\(100%)/);
      await expect(pageWords(page).nth(8)).toHaveAttribute('data-erased', String(!wasErased));
      await expect.poll(() => pageWords(page).nth(8).evaluate(word => getComputedStyle(word).color), { timeout: 3000 }).toBe(wasErased ? 'rgb(36, 35, 31)' : 'rgba(0, 0, 0, 0)');
    }
  });

  test('whiteout does the same with its white tape', async ({ page }) => {
    await open(page);
    await styleButton(page, /Whiteout/).click();
    const wasErased = await isErased(page, 8);
    expect(await toggle(page, 8)).toContain('background-size');
    await expect.poll(() => bar(page, 8), { timeout: 3000 }).toMatch(wasErased ? /^0%$/ : /^calc\(100%/);
  });

  test('faded ink fades in colour instead of drawing a bar', async ({ page }) => {
    await open(page);
    await styleButton(page, /Faded Ink/).click();
    const transitions = await toggle(page, 8);
    expect(transitions).toContain('color');
    expect(transitions).not.toContain('background-size');
  });

  test('nothing sweeps in when a page is opened or another passage is chosen', async ({ page }) => {
    await open(page);
    await passageButton(page, 'The Picture of Dorian Gray').click();
    await expect(pageWords(page).first()).toBeVisible();
    const running = await page.evaluate(() => document.getAnimations().filter(a => (a as CSSTransition).transitionProperty === 'background-size').length);
    expect(running).toBe(0);
  });

  test('is still, for someone who asks for less motion, though the word changes all the same', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const wasErased = await isErased(page, 8);
    expect(await toggle(page, 8)).toEqual([]);
    await expect(pageWords(page).nth(8)).toHaveAttribute('data-erased', String(!wasErased));
  });

  test('a page rises into view when a passage is chosen, and is left plain once it has', async ({ page }) => {
    await open(page);
    const frame = page.locator('.page-turn').first();
    await expect(frame).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector('.page-turn')!.getAnimations().length), { timeout: 3000 }).toBe(0);
    expect(await frame.evaluate(el => getComputedStyle(el).clipPath)).toBe('none');
  });
});
