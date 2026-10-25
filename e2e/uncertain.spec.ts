import { test, expect, type Locator, type Page } from '@playwright/test';
import { keptText, passageButton, poemLines, viewToggle } from './helpers';

// Poems that are 5–7–5 only if a word is counted a certain way: the ones Discover keeps behind a
// button and the Assisted page looks for only when asked. The passages' own uncertain words are
// checked against the dictionary in tests/unit/syllableEstimates.test.ts.

const studioPage = (page: Page) => page.getByRole('article', { name: /Passage text/ });

/** The poem on a card as its three lines. */
async function lines(card: Locator): Promise<string[]> {
  const text = await card.locator('p').first().innerText();
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

test.describe('Discover: poems that depend on how a word is said', () => {
  const toggle = (page: Page) => page.getByRole('button', { name: /depend(s)? on how a word is said/ });
  const uncertainCard = (page: Page, n: number) => page.getByRole('article', { name: `Uncertain poem ${n}` });
  const cards = (page: Page) => page.getByRole('article');

  async function openDiscover(page: Page, passage: string) {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { level: 1, name: 'Poems hiding in the text' })).toBeVisible();
    await passageButton(page, passage).click();
    await expect(page.getByRole('region', { name: /poems? to find/ })).toBeVisible();
  }

  test('Jane Eyre has 7 more, behind a button, and the poems to find are unchanged', async ({ page }) => {
    await openDiscover(page, 'Jane Eyre');
    await expect(page.getByRole('heading', { level: 2, name: '8 poems to find' })).toBeVisible();
    await expect(toggle(page)).toHaveText(/7 more poems depend on how a word is said/);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(cards(page)).toHaveCount(8); // hidden cards are not counted
    await expect(uncertainCard(page, 1)).toBeHidden();
    await expect(page.getByRole('group', { name: /Page DNA strip/ }).getByRole('button')).toHaveCount(8); // none is on the strip
  });

  test('opens to show them with a note on each, and closes again', async ({ page }) => {
    await openDiscover(page, 'Jane Eyre');
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('These are 5–7–5 only if a word is counted a certain way.')).toBeVisible();
    for (let n = 1; n <= 7; n++) await expect(uncertainCard(page, n)).toBeVisible();

    const first = uncertainCard(page, 1);
    expect(await lines(first)).toEqual(['wind had brought with it', 'clouds so sombre, and a rain', 'so penetrating,']);
    await expect(first.getByText('“sombre” is not in our dictionary. We estimated 2 syllables, from “somber”.')).toBeVisible();
    for (let n = 1; n <= 7; n++) await expect(uncertainCard(page, n).locator('ul li').first()).toBeVisible();

    await toggle(page).click();
    await expect(uncertainCard(page, 1)).toBeHidden();
  });

  test('no two cards share a name, and the headings stay in order', async ({ page }) => {
    await openDiscover(page, 'Jane Eyre');
    await toggle(page).click();
    const names = await cards(page).evaluateAll(els => els.map(el => el.getAttribute('aria-labelledby')));
    expect(new Set(names).size).toBe(names.length);
    expect(await page.getByRole('heading', { level: 2 }).allInnerTexts()).toEqual([
      '8 poems to find',
      ...Array.from({ length: 8 }, (_, i) => `Poem ${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `Uncertain poem ${i + 1}`),
    ]);
  });

  test('is not offered where no poem depends on a word being counted a certain way', async ({ page }) => {
    for (const name of ['Walden', 'The Picture of Dorian Gray']) {
      await openDiscover(page, name);
      await expect(toggle(page)).toHaveCount(0);
    }
  });

  test('an uncertain poem opens in the Studio with exactly its words', async ({ page }) => {
    await openDiscover(page, 'Jane Eyre');
    await toggle(page).click();
    const href = await page.getByRole('link', { name: 'Open uncertain poem 1 in the editor' }).getAttribute('href');
    await page.goto(href!);
    await expect(studioPage(page)).toBeVisible();
    expect(await keptText(page)).toBe('wind had brought with it clouds so sombre, and a rain so penetrating,');
    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual(['wind had brought with it', 'clouds so sombre, and a rain', 'so penetrating,']);
  });

  test('can be opened with the keyboard, is big enough to touch, and does not push a phone screen sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDiscover(page, 'Jane Eyre');
    const button = toggle(page);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(uncertainCard(page, 1)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('Assisted: poems that depend on how a word is said', () => {
  const FIRST_PAGE = 6;
  const cards = (page: Page) => page.getByRole('article');
  const ask = (page: Page) => page.getByRole('button', { name: 'Also show poems that depend on how a word is said' });
  const region = (page: Page) => page.getByRole('region', { name: 'Poems that depend on how a word is said' });
  const uncertainCard = (page: Page, n: number) => page.getByRole('article', { name: `Uncertain poem ${n}` });

  async function openAssist(page: Page, hash = '') {
    await page.goto(`/assist${hash}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Poems you can erase your way to' })).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
  }

  test('are left out of the main list and not looked for until asked', async ({ page }) => {
    await openAssist(page);
    await expect(ask(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '14 poems to make' })).toBeVisible();
    await expect(cards(page)).toHaveCount(FIRST_PAGE);
    await expect(region(page)).toHaveCount(0);
    await expect(page.locator('mark[class*="decoration-dotted"]')).toHaveCount(0); // nothing underlined on the main poems
  });

  test('Jane Eyre: asking shows 7 poems, each with a note, and the uncertain word underlined', async ({ page }) => {
    await openAssist(page);
    await ask(page).click();
    await expect(region(page)).toBeFocused();
    await expect(region(page).getByRole('heading', { level: 2, name: 'Poems that depend on how a word is said' })).toBeVisible();
    for (let n = 1; n <= 7; n++) await expect(uncertainCard(page, n)).toBeVisible();

    const first = uncertainCard(page, 1);
    expect(await lines(first)).toEqual(['time neither quarrelling', 'crying) perfectly happy.', 'joining group; saying,']);
    await expect(first.getByText('“quarrelling” is not in our dictionary. “quarreling” can be said with 2 or 3 syllables, and this poem counts it as 2.')).toBeVisible();
    await expect(first.locator('mark[class*="decoration-dotted"]')).toHaveText(['quarrelling']);
    await expect(ask(page)).toHaveCount(0);
    await expect(cards(page)).toHaveCount(FIRST_PAGE + 7); // the main poems are still there
  });

  test('Walden: 2 poems, one of them built on "deliberately"', async ({ page }) => {
    await openAssist(page, '#passage=walden-woods');
    await ask(page).click();
    await expect(uncertainCard(page, 2)).toBeVisible();
    await expect(page.getByRole('article', { name: 'Uncertain poem 3' })).toHaveCount(0);
    expect(await lines(uncertainCard(page, 1))).toEqual(['went to woods because', 'wished live deliberately,', 'essential facts life,']);
    await expect(uncertainCard(page, 1).getByText('“deliberately” can be said with 4 or 5 syllables. This poem counts it as 5.')).toBeVisible();
  });

  test('an uncertain poem opens in the Studio with exactly its words', async ({ page }) => {
    await openAssist(page, '#passage=walden-woods');
    await ask(page).click();
    await page.getByRole('link', { name: 'Open uncertain poem 1 in the editor' }).click();
    await expect(page).toHaveURL(/\/studio/);
    await expect(studioPage(page)).toBeVisible();
    expect(await keptText(page)).toBe('went to woods because wished live deliberately, essential facts life,');
    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual(['went to woods because', 'wished live deliberately,', 'essential facts life,']);
  });

  test('changing the passage puts the button back, and asking again works', async ({ page }) => {
    await openAssist(page);
    await ask(page).click();
    await expect(uncertainCard(page, 1)).toBeVisible();
    await passageButton(page, 'The Picture of Dorian Gray').click();
    await expect(ask(page)).toBeVisible();
    await expect(region(page)).toHaveCount(0);
    await ask(page).click();
    await expect(uncertainCard(page, 3)).toBeVisible();
    expect(await lines(uncertainCard(page, 1))).toEqual(['flight flitted across', 'stretched in front of huge window,', 'Japanese effect,']);
  });

  test('can be asked for with the keyboard, is big enough to touch, and does not push a phone screen sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAssist(page);
    expect((await ask(page).boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await ask(page).focus();
    await page.keyboard.press('Enter');
    await expect(uncertainCard(page, 1)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('every control is at least 24 by 24 pixels and named apart from the main poems\'', async ({ page }) => {
    await openAssist(page);
    await ask(page).click();
    await expect(uncertainCard(page, 7)).toBeVisible();
    const names = await page.getByRole('main').locator('a').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
    expect(new Set(names).size).toBe(names.length);
    const small = await page.getByRole('main').locator('a, button').evaluateAll(els =>
      els
        .map(el => ({ label: el.getAttribute('aria-label') || (el.textContent ?? '').trim(), box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 24 || box.height < 24))
        .map(({ label, box }) => `${label}: ${Math.round(box.width)}x${Math.round(box.height)}`)
    );
    expect(small).toEqual([]);
  });
});
