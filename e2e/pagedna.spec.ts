import { test, expect, type Page } from '@playwright/test';
import { openStudio, pageWords, passageButton } from './helpers';

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Studio controls' });
const strip = (page: Page) => sidebar(page).getByRole('img', { name: /Page DNA strip/ });
const blocks = (page: Page) => strip(page).locator('[data-poem]');

// Poems to find (weak line endings hidden, overlapping windows grouped), per passage.
const PASSAGES = [
  { name: 'Jane Eyre', poems: 8, every: 30 },
  { name: 'Walden', poems: 9, every: 24 },
  { name: 'The Picture of Dorian Gray', poems: 7, every: 28 },
];

test.describe('Page DNA', () => {
  for (const { name, poems, every } of PASSAGES) {
    test(`${name}: says ${poems} poems to find, about one every ${every} words`, async ({ page }) => {
      await openStudio(page);
      await passageButton(page, name).click();

      await expect(sidebar(page).getByText(`${poems} poems to find`)).toBeVisible();
      await expect(sidebar(page).getByText(`about one every ${every} words`)).toBeVisible();
      await expect(blocks(page)).toHaveCount(poems);
    });
  }

  test('puts the plain words first and keeps the per-100-words number to a hover detail', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await expect(sidebar(page).getByText('9 poems to find')).toBeVisible();

    // The old label and figure are gone from the page.
    await expect(page.getByText('Found Density')).toHaveCount(0);
    await expect(page.getByText(/per 100 ?w|\/ 100w/)).toHaveCount(0);
    expect(await sidebar(page).innerText()).not.toContain('4.23');

    // The number is available on hover (a title attribute), with a one-line key to the strip.
    const hover = sidebar(page).locator('[title*="per 100 words"]');
    await expect(hover).toHaveAttribute('title', /Each block is a poem to find.*4\.23 per 100 words/);
  });

  test('moves to the new passage and never shows the previous passage\'s strip', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await expect(blocks(page)).toHaveCount(9);

    await passageButton(page, 'The Picture of Dorian Gray').click();
    await expect(sidebar(page).getByText('7 poems to find')).toBeVisible();
    await expect(blocks(page)).toHaveCount(7);
    await expect(sidebar(page).getByText('9 poems to find')).toHaveCount(0);

    await passageButton(page, 'Jane Eyre').click();
    await expect(sidebar(page).getByText('8 poems to find')).toBeVisible();
    await expect(blocks(page)).toHaveCount(8);
  });

  test('draws each block inside the strip and never over another block in the same row', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await expect(blocks(page)).toHaveCount(9);

    const stripBox = (await strip(page).boundingBox())!;
    const boxes = await blocks(page).evaluateAll(els =>
      els.map(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })
    );

    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(stripBox.x - 0.5);
      expect(b.right).toBeLessThanOrEqual(stripBox.x + stripBox.width + 0.5);
      expect(b.top).toBeGreaterThanOrEqual(stripBox.y - 0.5);
      expect(b.bottom).toBeLessThanOrEqual(stripBox.y + stripBox.height + 0.5);
    }
    // Overlapping poems are drawn in different rows, so no two blocks ever cover each other.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const apartAlong = boxes[i].right <= boxes[j].left + 0.5 || boxes[j].right <= boxes[i].left + 0.5;
        const apartAcross = boxes[i].bottom <= boxes[j].top + 0.5 || boxes[j].bottom <= boxes[i].top + 0.5;
        expect(apartAlong || apartAcross, `blocks ${i} and ${j}`).toBe(true);
      }
    }
  });

  test('places the first Walden poem where it really is in the text', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await expect(blocks(page)).toHaveCount(9);

    // The first poem to find starts at word 14 of 213, at "the essential facts".
    const words = pageWords(page);
    await expect(words.nth(14)).toHaveText('the');
    await expect(words.nth(15)).toHaveText('essential');
    await expect(words.nth(16)).toHaveText('facts');

    const stripBox = (await strip(page).boundingBox())!;
    const first = (await blocks(page).first().boundingBox())!;
    const expectedLeft = stripBox.x + (14 / 213) * stripBox.width;
    expect(Math.abs(first.x - expectedLeft)).toBeLessThan(1);
    // It spans 15 words: the essential facts / of life, and see if I could / not learn what it had.
    expect(Math.abs(first.width - (15 / 213) * stripBox.width)).toBeLessThan(1);
  });

  test('gives the strip a spoken description', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await expect(strip(page)).toHaveAccessibleName('Page DNA strip. 9 poems to find, about one every 24 words.');
  });
});
