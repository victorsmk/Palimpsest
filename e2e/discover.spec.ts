import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { keptText, keptWords, passageButton, poemLines, viewToggle } from './helpers';

// The golden fixture of every poem the search finds (checked against the library by unit tests).
const golden: Record<string, { families: { lines: string[] }[] }> = JSON.parse(
  readFileSync(new URL('../tests/fixtures/found-families.json', import.meta.url), 'utf8')
);

const PASSAGES = [
  { id: 'jane-eyre-ch1', name: 'Jane Eyre', poems: 8, every: 30 },
  { id: 'walden-woods', name: 'Walden', poems: 9, every: 24 },
  { id: 'dorian-gray-ch1', name: 'The Picture of Dorian Gray', poems: 7, every: 28 },
] as const;

async function openDiscover(page: Page, passage?: string) {
  await page.goto('/discover');
  await expect(page.getByRole('heading', { level: 1, name: 'Poems hiding in the text' })).toBeVisible();
  if (passage) await passageButton(page, passage).click();
  await expect(page.getByRole('region', { name: /poems? to find/ })).toBeVisible();
}

const card = (page: Page, n: number) => page.getByRole('article', { name: `Poem ${n}` });
const cards = (page: Page) => page.getByRole('article');
const strip = (page: Page) => page.getByRole('group', { name: /Page DNA strip/ });
const block = (page: Page, n: number) => strip(page).getByRole('button', { name: `Go to poem ${n}` });
const openLink = (page: Page, n: number) => page.getByRole('link', { name: `Open poem ${n} in the editor` });

/** The poem on a card as its three lines. */
async function lines(card: Locator): Promise<string[]> {
  const text = await card.locator('p').first().innerText();
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

test.describe('the list of poems', () => {
  for (const { id, name, poems, every } of PASSAGES) {
    test(`${name}: ${poems} poems to find, every one exactly as the search found it`, async ({ page }) => {
      await openDiscover(page, name);

      await expect(page.getByRole('heading', { level: 2, name: `${poems} poems to find` })).toBeVisible();
      await expect(page.getByText(`about one every ${every} words`)).toBeVisible();
      await expect(cards(page)).toHaveCount(poems);
      await expect(strip(page).getByRole('button')).toHaveCount(poems);

      // All of them, in reading order, against the golden fixture.
      const expected = golden[id].families;
      for (let i = 0; i < poems; i++) {
        expect(await lines(card(page, i + 1)), `poem ${i + 1}`).toEqual(expected[i].lines);
      }
    });
  }

  test('starts on the first passage and says which book the poems are in', async ({ page }) => {
    await openDiscover(page);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Here are the ones in Jane Eyre.')).toBeVisible();
    await expect(cards(page)).toHaveCount(8);
  });

  test('switching passage replaces the poems and never shows the last passage\'s', async ({ page }) => {
    await openDiscover(page, 'Walden');
    await expect(cards(page)).toHaveCount(9);

    await passageButton(page, 'The Picture of Dorian Gray').click();
    await expect(page.getByRole('heading', { level: 2, name: '7 poems to find' })).toBeVisible();
    await expect(cards(page)).toHaveCount(7);
    expect(await lines(card(page, 1))).toEqual(golden['dorian-gray-ch1'].families[0].lines);
    await expect(page.getByText('the essential facts')).toHaveCount(0);
  });

  test('says where each poem sits and shows the passage around it', async ({ page }) => {
    await openDiscover(page, 'Walden');
    const first = card(page, 1);
    await expect(first.getByText('words 15–29 of 213')).toBeVisible();
    // The poem, highlighted inside the sentence it comes from.
    await expect(first.locator('mark')).toHaveText(
      'the essential facts of life, and see if I could not learn what it had'
    );
    await expect(first).toContainText('to front only');
    await expect(first).toContainText('to teach, and not,');
  });
});

test.describe('other ways to read a poem', () => {
  test('are folded away until asked for, then show the same stretch broken differently', async ({ page }) => {
    await openDiscover(page, 'Walden');
    const second = card(page, 2);
    const toggle = second.getByRole('button', { name: /3 other ways to read this/ });
    const variants = second.getByRole('list', { name: 'Other ways to read poem 2' });

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(variants).toBeHidden();
    // The variants are in the page but folded away: none of them is visible.
    const folded = second.locator('ul li p');
    await expect(folded).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(folded.nth(i)).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(variants.getByRole('listitem')).toHaveCount(3);
    const texts = await variants.getByRole('listitem').evaluateAll(items =>
      items.map(item => (item.querySelector('p') as HTMLElement).innerText.split('\n').map(l => l.trim()).filter(Boolean))
    );
    expect(texts).toEqual([
      ['what it had to teach,', 'and not, when I came to die,', 'discover that I'],
      ['to teach, and not, when', 'I came to die, discover', 'that I had not lived.'],
      ['and not, when I came', 'to die, discover that I', 'had not lived. I did'],
    ]);

    await toggle.click();
    await expect(variants).toBeHidden();
  });

  test('are not offered for a poem that has none, and say "way" for exactly one', async ({ page }) => {
    await openDiscover(page, 'Walden');
    await expect(card(page, 5).getByRole('button', { name: /other way/ })).toHaveCount(0);
    await expect(card(page, 4).getByRole('button', { name: '1 other way to read this' })).toBeVisible();
  });

  test('can be opened from the keyboard', async ({ page }) => {
    await openDiscover(page, 'Walden');
    const toggle = card(page, 1).getByRole('button', { name: /3 other ways/ });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Open in editor', () => {
  test('lands in the Studio with exactly the poem\'s words kept and its line breaks', async ({ page }) => {
    await openDiscover(page, 'Walden');
    await openLink(page, 1).click();

    await expect(page).toHaveURL(/\/studio$/); // the link is taken out of the address bar
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(page)).toBe('the essential facts of life, and see if I could not learn what it had');
    await expect(keptWords(page)).toHaveCount(15);
    await expect(page.getByRole('status').filter({ hasText: 'Opened a poem found in Walden.' })).toBeVisible();

    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual(['the essential facts', 'of life, and see if I could', 'not learn what it had']);
  });

  test('works for a variant: the same stretch with its own line breaks', async ({ page }) => {
    await openDiscover(page, 'Walden');
    const second = card(page, 2);
    await second.getByRole('button', { name: /3 other ways/ }).click();
    await second.getByRole('link', { name: 'Open variant 1 of poem 2 in the editor' }).click();

    await expect(page).toHaveURL(/\/studio$/);
    expect(await keptText(page)).toBe('what it had to teach, and not, when I came to die, discover that I');
    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual(['what it had to teach,', 'and not, when I came to die,', 'discover that I']);
  });

  test('works from another passage, keeping a sentence end inside the poem', async ({ page }) => {
    await openDiscover(page, 'Jane Eyre');
    await openLink(page, 3).click();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(page)).toBe('outdoor exercise was now out of the question. I was glad of it:');
  });

  test('works from the keyboard', async ({ page }) => {
    await openDiscover(page, 'The Picture of Dorian Gray');
    await openLink(page, 1).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/studio$/);
    expect(await keptText(page)).toBe('was filled with the rich odour of roses, and when the light summer wind');
  });

  test('every link on the page opens a poem the Studio accepts', async ({ page }) => {
    await openDiscover(page, 'Walden');
    for (let n = 1; n <= 9; n++) {
      const href = await openLink(page, n).getAttribute('href');
      expect(href, `poem ${n}`).toMatch(/^\/studio#found=walden-woods:\d+-\d+:\d+,\d+$/);
    }
  });
});

test.describe('the strip', () => {
  test('numbers the poems left to right', async ({ page }) => {
    await openDiscover(page, 'Walden');
    const lefts: number[] = [];
    for (let n = 1; n <= 9; n++) lefts.push((await block(page, n).boundingBox())!.x);
    for (let i = 1; i < lefts.length; i++) expect(lefts[i]).toBeGreaterThanOrEqual(lefts[i - 1] - 0.5);
  });

  test('takes you to a poem: scrolls to its card and moves focus there', async ({ page }) => {
    await openDiscover(page, 'Walden');
    await expect(card(page, 8)).not.toBeInViewport();
    await block(page, 8).click();
    await expect(card(page, 8)).toBeInViewport();
    await expect(card(page, 8)).toBeFocused();
  });

  test('works from the keyboard', async ({ page }) => {
    await openDiscover(page, 'Walden');
    await block(page, 6).focus();
    await page.keyboard.press('Enter');
    await expect(card(page, 6)).toBeFocused();
  });

  test('outlines a poem\'s block while you are over its card, and the reverse', async ({ page }) => {
    await openDiscover(page, 'Walden');
    await expect(block(page, 2)).toHaveAttribute('data-active', 'false');
    await card(page, 2).hover();
    await expect(block(page, 2)).toHaveAttribute('data-active', 'true');
    await expect(block(page, 1)).toHaveAttribute('data-active', 'false');

    await page.mouse.move(0, 0);
    await block(page, 5).hover();
    await expect(card(page, 5)).toHaveAttribute('data-active', 'true');
  });

  test('keeps the per-100-words number to a hover detail', async ({ page }) => {
    await openDiscover(page, 'Walden');
    expect(await page.getByRole('main').innerText()).not.toContain('4.23');
    await expect(page.locator('[title*="per 100 words"]').first()).toHaveAttribute('title', /4\.23 per 100 words/);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fits the screen: nothing runs off the side, poems stay inside their cards', async ({ page }) => {
    for (const { name, poems } of PASSAGES) {
      await openDiscover(page, name);
      await expect(cards(page)).toHaveCount(poems);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} page width`).toBeLessThanOrEqual(0);

      const tooWide = await page.locator('article').evaluateAll(articles =>
        articles.filter(a => a.scrollWidth > a.clientWidth + 1).length
      );
      expect(tooWide, `${name} cards wider than the screen`).toBe(0);
    }
  });

  test('still has a usable strip and a way into the editor', async ({ page }) => {
    await openDiscover(page, 'Walden');
    const box = (await strip(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(250);
    await block(page, 3).click();
    await expect(card(page, 3)).toBeFocused();

    await openLink(page, 3).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(keptWords(page)).toHaveCount(15);
  });
});

test.describe('getting around', () => {
  test('has links to the Studio and the home page', async ({ page }) => {
    await openDiscover(page);
    await page.getByRole('link', { name: 'Studio', exact: true }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await page.goBack();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
