import { test, expect, type Page } from '@playwright/test';
import { openStudio, pageWords, passageButton, styleButton } from './helpers';

/** [x, y, width, height] of every word of the page, in page coordinates. */
type Box = [number, number, number, number];

async function wordBoxes(page: Page): Promise<Box[]> {
  return pageWords(page).evaluateAll(words =>
    words.map(word => {
      const r = word.getBoundingClientRect();
      return [r.x + window.scrollX, r.y + window.scrollY, r.width, r.height] as [number, number, number, number];
    })
  );
}

async function frameHeight(page: Page): Promise<number> {
  return (await page.locator('article').locator('xpath=..').boundingBox())!.height;
}

/** The words that are not exactly where they were, with where they were and are. */
async function movedWords(page: Page, baseline: Box[]) {
  const now = await wordBoxes(page);
  const texts = await pageWords(page).allInnerTexts();
  const moved: { index: number; word: string; was: Box; now: Box }[] = [];
  baseline.forEach((was, index) => {
    if (!now[index] || was.some((value, i) => Math.abs(value - now[index][i]) > 0.01)) {
      moved.push({ index, word: texts[index], was, now: now[index] });
    }
  });
  return { count: now.length, moved: moved.slice(0, 3), movedTotal: moved.length };
}

// The page is a book page: words must stay where the author put them whatever is erased
// and however it is erased. Checked on a wide and a narrow screen, since line wrapping
// (where a layout shift hurts most) differs between them.
for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test.describe(`word positions (${name})`, () => {
    test.use({ viewport });

    test('erasing words or changing the erasure style never moves a word', async ({ page }) => {
      await openStudio(page);
      await passageButton(page, 'Walden').click();
      // Transitions only repaint; switch them off so every reading is of the settled layout.
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });

      const baseline = await wordBoxes(page);
      const baselineHeight = await frameHeight(page);
      expect(baseline.length).toBeGreaterThan(150);

      // Erase every third word, in the default style. One in-page step instead of ~70 separate
      // clicks: how a click is delivered is covered by other specs, and this keeps the test fast
      // enough for the slower engines.
      await pageWords(page).evaluateAll(words =>
        words.forEach((word, i) => {
          if (i % 3 === 0) (word as HTMLElement).click();
        })
      );
      await expect(page.locator('article button[aria-pressed="false"]')).toHaveCount(
        Math.ceil(baseline.length / 3)
      );
      expect(await movedWords(page, baseline), 'after erasing every third word').toMatchObject({
        count: baseline.length,
        movedTotal: 0,
      });
      expect(await frameHeight(page), 'page height after erasing').toBeCloseTo(baselineHeight, 1);

      // Every style, with the same words erased.
      for (const [label, style] of [
        ['faded ink', /Faded Ink/],
        ['whiteout', /Whiteout/],
        ['blackout', /Blackout/],
      ] as const) {
        await styleButton(page, style).click();
        expect(await movedWords(page, baseline), `words in ${label}`).toMatchObject({ movedTotal: 0 });
        expect(await frameHeight(page), `page height in ${label}`).toBeCloseTo(baselineHeight, 1);
      }

      // Everything erased, then everything restored.
      await page.getByRole('button', { name: 'Erase All' }).click();
      expect(await movedWords(page, baseline), 'after Erase All').toMatchObject({ movedTotal: 0 });
      await page.getByRole('button', { name: 'Restore All' }).click();
      expect(await movedWords(page, baseline), 'after Restore All').toMatchObject({ movedTotal: 0 });
      expect(await frameHeight(page), 'page height after Restore All').toBeCloseTo(baselineHeight, 1);
    });
  });
}
