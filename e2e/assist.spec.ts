import { test, expect, type Locator, type Page } from '@playwright/test';
import { keptText, keptWords, passageButton, poemLines } from './helpers';

// The poem each passage ranks first. Ranking is heuristic, so these change when the rules are tuned;
// that is a deliberate, reviewed change (tests/unit/assistedSearch.test.ts checks the rules themselves).
const PASSAGES = [
  { name: 'Jane Eyre', total: 14, first: ['rain penetrating,', 'exercise now out question.', 'never liked long walks,'] },
  { name: 'Walden', total: 10, first: ['life, living is dear;', 'wish practise resignation,', 'quite necessary.'] },
  { name: 'The Picture of Dorian Gray', total: 9, first: ['pink-flowering thorn.', 'divan Persian saddle-bags', 'was lying, smoking,'] },
] as const;

const FIRST_PAGE = 6;

/** The Studio's passage text. (After a client-side navigation the page left behind can still be in the DOM, hidden.) */
const studioPage = (page: Page) => page.getByRole('article', { name: /Passage text/ });

async function openAssist(page: Page, hash = '') {
  await page.goto(`/assist${hash}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Poems you can erase your way to' })).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
}

const cards = (page: Page) => page.getByRole('article');
const card = (page: Page, n: number) => page.getByRole('article', { name: `Poem ${n}` });
const showMore = (page: Page) => page.getByRole('button', { name: /^Show \d+ more/ });

/** The poem on a card as its three lines. */
async function lines(card: Locator): Promise<string[]> {
  const text = await card.locator('p').first().innerText();
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

test.describe('the poems', () => {
  for (const { name, total, first } of PASSAGES) {
    test(`${name}: ${total} poems to make, the first ${FIRST_PAGE} shown, the best one first`, async ({ page }) => {
      await openAssist(page);
      await passageButton(page, name).click();
      await expect(page.getByRole('heading', { level: 2, name: `${total} poems to make` })).toBeVisible();
      await expect(cards(page)).toHaveCount(FIRST_PAGE);
      expect(await lines(card(page, 1))).toEqual(first);
    });
  }

  test('says it is a selection and how it was chosen, and what the marking means', async ({ page }) => {
    await openAssist(page);
    await expect(page.getByText('A selection, not every possible poem')).toBeVisible();
    await expect(page.getByText('no two are much alike')).toBeVisible();
    await expect(page.getByText('words are kept; struck-through words are the ones erased')).toBeVisible();
    expect(await page.getByRole('main').innerText()).not.toMatch(/score|haiku/i);
  });

  test('starts on the first passage', async ({ page }) => {
    await openAssist(page);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Keep some of the words of Jane Eyre')).toBeVisible();
  });

  test('shows the passage a poem was taken from, the poem\'s words marked and the rest struck through', async ({ page }) => {
    await openAssist(page);
    await passageButton(page, 'Walden').click();
    const first = card(page, 1);
    await expect(first.getByText('words 54–70 of 213 · keeps 9 of 17')).toBeVisible();

    const marked = await first.locator('mark').allInnerTexts();
    expect(marked.join(' ')).toBe('life, living is dear; wish practise resignation, quite necessary.');
    const struck = await first.locator('span.line-through').allInnerTexts();
    expect(struck.length).toBeGreaterThanOrEqual(8);
    // The struck-through words are really crossed out on screen.
    expect(await first.locator('span.line-through').first().evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('line-through');
  });
});

test.describe('showing more', () => {
  test('adds poems a few at a time, keeps the ones already shown, and stops when there are no more', async ({ page }) => {
    await openAssist(page);
    await expect(cards(page)).toHaveCount(6);
    const firstSix = [];
    for (let n = 1; n <= 6; n++) firstSix.push(await lines(card(page, n)));

    await expect(showMore(page)).toHaveText('Show 6 more poems');
    await showMore(page).click();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.getByRole('status').filter({ hasText: 'Showing 12 of 14 poems.' })).toHaveCount(1);
    for (let n = 1; n <= 6; n++) expect(await lines(card(page, n))).toEqual(firstSix[n - 1]);

    await expect(showMore(page)).toHaveText('Show 2 more poems');
    await showMore(page).click();
    await expect(cards(page)).toHaveCount(14);
    await expect(showMore(page)).toHaveCount(0);
  });

  test('is not offered when everything fits', async ({ page }) => {
    await openAssist(page, '#passage=dorian-gray-ch1');
    await expect(cards(page)).toHaveCount(6);
    await expect(showMore(page)).toHaveText('Show 3 more poems');
    await showMore(page).click();
    await expect(cards(page)).toHaveCount(9);
    await expect(showMore(page)).toHaveCount(0);
  });

  test('starts again from the first poems when the passage changes', async ({ page }) => {
    await openAssist(page);
    await showMore(page).click();
    await expect(cards(page)).toHaveCount(12);
    await passageButton(page, 'Walden').click();
    await expect(cards(page)).toHaveCount(6);
    await passageButton(page, 'Jane Eyre').click();
    await expect(cards(page)).toHaveCount(6);
  });
});

test.describe('the passage in the address', () => {
  test('a link with a passage opens on it, and choosing one updates the address so a reload comes back to it', async ({ page }) => {
    await openAssist(page, '#passage=walden-woods');
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { level: 2, name: '10 poems to make' })).toBeVisible();

    await passageButton(page, 'The Picture of Dorian Gray').click();
    await expect(page).toHaveURL(/#passage=dorian-gray-ch1$/);
    await page.reload();
    await expect(passageButton(page, 'The Picture of Dorian Gray')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { level: 2, name: '9 poems to make' })).toBeVisible();
  });

  test('says aloud how many poems there are when the passage changes', async ({ page }) => {
    await openAssist(page);
    const announcement = page.getByRole('status').filter({ hasText: 'to make from' });
    await expect(announcement).toHaveText('14 poems to make from Jane Eyre.');
    await passageButton(page, 'Walden').click();
    await expect(announcement).toHaveText('10 poems to make from Walden.');
  });
});

test.describe('opening a poem in the Studio', () => {
  for (const { name, first } of PASSAGES) {
    test(`${name}: the first poem arrives in the Studio as exactly its words and lines`, async ({ page }) => {
      await openAssist(page);
      await passageButton(page, name).click();
      const cardLines = await lines(card(page, 1));
      expect(cardLines).toEqual(first);

      await page.getByRole('link', { name: 'Open poem 1 in the editor' }).click();
      await expect(page).toHaveURL(/\/studio/);
      await expect(studioPage(page)).toBeVisible();
      await expect(passageButton(page, name)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('status').filter({ hasText: `Opened a poem made from ${name}.` })).toBeVisible();
      expect(await keptText(page)).toBe(first.join(' '));

      await page.getByRole('group', { name: 'Studio view' }).getByRole('button', { name: 'Extracted poem', exact: true }).click();
      expect(await poemLines(page)).toEqual(first);
    });
  }

  test('every poem on the first page opens with the words it shows', async ({ page }) => {
    await openAssist(page, '#passage=walden-woods');
    const hrefs = await page.getByRole('link', { name: /^Open poem \d+ in the editor$/ }).evaluateAll(links => links.map(l => l.getAttribute('href')!));
    const expected: string[][] = [];
    for (let n = 1; n <= FIRST_PAGE; n++) expected.push((await card(page, n).locator('mark').allInnerTexts()));
    expect(hrefs).toHaveLength(FIRST_PAGE);

    for (let i = 0; i < hrefs.length; i++) {
      await page.goto(hrefs[i]);
      await expect(studioPage(page)).toBeVisible();
      await expect(keptWords(page)).toHaveCount(expected[i].length);
      expect(await keptText(page)).toBe(expected[i].join(' '));
    }
  });
});

test.describe('getting to and from the page', () => {
  test('is linked from Home, Discover and the Studio, and links back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Assisted poems' }).click();
    await expect(page).toHaveURL(/\/assist/);

    await page.goto('/');
    await page.getByRole('link', { name: 'Erase your way to a poem' }).click();
    await expect(page).toHaveURL(/\/assist/);

    await page.goto('/discover');
    await page.getByRole('link', { name: 'Assisted', exact: true }).click();
    await expect(page).toHaveURL(/\/assist/);

    await page.goto('/studio');
    await expect(studioPage(page)).toBeVisible();
    await page.getByRole('link', { name: 'Assisted', exact: true }).click();
    await expect(page).toHaveURL(/\/assist/);

    await expect(cards(page).first()).toBeVisible();
    await page.getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL(/\/discover/);
    await page.goBack();
    await page.getByRole('link', { name: 'Studio', exact: true }).click();
    await expect(page).toHaveURL(/\/studio/);
    await page.goBack();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('has its own title', async ({ page }) => {
    await page.goto('/assist');
    await expect(page).toHaveTitle('Assisted · Palimpsest');
  });

  test('starts with the skip link, which moves focus to the main content', async ({ page, browserName }) => {
    await openAssist(page);
    const link = page.getByRole('link', { name: 'Skip to main content' });
    if (browserName !== 'webkit') await page.keyboard.press('Tab'); // Safari-style Tab skips links
    else await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });
});

test.describe('keyboard, screen reader and touch', () => {
  test('the headings are in order: one h1, a heading for the count, then one for each poem', async ({ page }) => {
    await openAssist(page, '#passage=walden-woods');
    const headings = await page.getByRole('heading').evaluateAll(els => els.map(el => [el.tagName, (el.textContent ?? '').trim()]));
    expect(headings[0]).toEqual(['H1', 'Poems you can erase your way to']);
    expect(headings[1]).toEqual(['H2', '10 poems to make']);
    expect(headings.slice(2).map(h => h[1])).toEqual(Array.from({ length: FIRST_PAGE }, (_, i) => `Poem ${i + 1}`));
  });

  test('every control has a distinct name that says which poem it belongs to', async ({ page }) => {
    await openAssist(page, '#passage=walden-woods');
    const names = await page.getByRole('main').locator('a, button').evaluateAll(els => els.map(el => el.getAttribute('aria-label') || (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
    expect(names.filter(n => n === '')).toEqual([]);
    const opens = names.filter(n => /^Open poem/.test(n));
    expect(opens).toEqual(Array.from({ length: FIRST_PAGE }, (_, i) => `Open poem ${i + 1} in the editor`));
  });

  test('the poems can be reached and opened from the keyboard', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Safari-style Tab skips links');
    await openAssist(page, '#passage=walden-woods');
    await page.getByRole('button', { name: 'Walden' }).focus();
    for (let i = 0; i < 2; i++) await page.keyboard.press('Tab'); // Dorian Gray (the passage after Walden), then the first link
    await expect(page.getByRole('link', { name: 'Open poem 1 in the editor' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/studio/);
  });

  test('"Show more" can be pressed with the keyboard, and focus stays on it', async ({ page }) => {
    await openAssist(page);
    await showMore(page).focus();
    await page.keyboard.press('Enter');
    await expect(cards(page)).toHaveCount(12);
    await expect(showMore(page)).toBeFocused();
  });

  for (const [label, viewport] of [['desktop', null], ['a phone', { width: 390, height: 844 }]] as const) {
    test(`every control is at least 24 by 24 pixels, on ${label}`, async ({ page }) => {
      if (viewport) await page.setViewportSize(viewport);
      await openAssist(page, '#passage=walden-woods');
      const small = await page.getByRole('main').locator('a, button').evaluateAll(els =>
        els
          .map(el => ({ label: el.getAttribute('aria-label') || (el.textContent ?? '').trim(), box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && (box.width < 24 || box.height < 24))
          .map(({ label, box }) => `${label}: ${Math.round(box.width)}x${Math.round(box.height)}`)
      );
      expect(small).toEqual([]);
    });
  }

  test('does not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAssist(page, '#passage=jane-eyre-ch1');
    await showMore(page).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the faded, struck-through words are still readable (contrast of at least 4.5)', async ({ page }) => {
    await openAssist(page, '#passage=walden-woods');
    const ratios = await card(page, 1).locator('span.line-through').evaluateAll(spans => {
      const toRgb = (css: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (rgb: number[]) => {
        const [r, g, b] = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return spans.map(span => {
        const text = luminance(toRgb(getComputedStyle(span).color));
        const paper = luminance(toRgb(getComputedStyle(span.parentElement!).backgroundColor));
        const [hi, lo] = [text, paper].sort((a, b) => b - a);
        return (hi + 0.05) / (lo + 0.05);
      });
    });
    expect(ratios.length).toBeGreaterThan(0);
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
