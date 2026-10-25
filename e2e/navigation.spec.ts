import { test, expect, type Page } from '@playwright/test';
import { openStudio, passageButton } from './helpers';

const strip = (page: Page) => page.getByRole('group', { name: /Page DNA strip/ });
const cards = (page: Page) => page.getByRole('article');

async function openDiscover(page: Page, hash = '') {
  await page.goto(`/discover${hash}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Poems hiding in the text' })).toBeVisible();
  await expect(cards(page).first()).toBeVisible();
}

/** What a screen reader would call the focused element: its label, else its text without anything hidden from assistive technology. */
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    const label = el.getAttribute('aria-label');
    if (label) return label;
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(hidden => hidden.remove());
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

// Safari's default is that Tab stops on form controls and buttons but skips links (Option+Tab reaches
// them). Playwright's WebKit behaves like that, so in it links are not in the Tab order.
const linksInTabOrder = (browserName: string) => browserName !== 'webkit';

test.describe('page titles', () => {
  test('each page names itself, with the site name after it', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Palimpsest — Found Poetry & Erasure Workshop');
    await page.goto('/studio');
    await expect(page).toHaveTitle('Studio · Palimpsest');
    await page.goto('/discover');
    await expect(page).toHaveTitle('Discover · Palimpsest');
  });
});

test.describe('no copyright line', () => {
  for (const path of ['/', '/studio', '/discover']) {
    test(`${path} carries no copyright notice`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      expect(await page.locator('body').innerText()).not.toMatch(/©|copyright/i);
    });
  }
});

test.describe('skip link', () => {
  for (const [name, path, ready] of [
    ['home', '/', (p: Page) => p.getByRole('heading', { level: 1 }).first()],
    ['Studio', '/studio', (p: Page) => p.locator('article')],
    ['Discover', '/discover', (p: Page) => p.getByRole('article').first()],
  ] as const) {
    test(`is the first stop on the ${name} page, appears when focused, and moves focus to the main content`, async ({ page, browserName }) => {
      await page.goto(path);
      await expect(ready(page)).toBeVisible();

      const link = page.getByRole('link', { name: 'Skip to main content' });
      if (linksInTabOrder(browserName)) {
        await page.keyboard.press('Tab');
      } else {
        await link.focus(); // Safari-style Tab would skip a link; check what happens once it is focused
      }
      await expect(link).toBeFocused();
      await expect(link).toBeInViewport(); // visible while focused, not clipped away
      expect(((await link.boundingBox())!).width).toBeGreaterThan(100);

      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
    });
  }

  test('is hidden until focused', async ({ page }) => {
    await page.goto('/discover');
    const box = await page.getByRole('link', { name: 'Skip to main content' }).boundingBox();
    expect(box === null || box.width <= 1).toBe(true);
  });
});

test.describe('getting between the pages', () => {
  test('the home page leads to Discover and the Studio', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Discover poems' }).click();
    await expect(page).toHaveURL(/\/discover/);

    await page.goto('/');
    await page.getByRole('link', { name: 'Find the poems in a text' }).click();
    await expect(page).toHaveURL(/\/discover/);

    await page.goto('/');
    await page.getByRole('link', { name: 'Open the Studio' }).first().click();
    await expect(page).toHaveURL(/\/studio/);
  });

  test('the Studio header leads to Discover and Home', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL(/\/discover/);
    await expect(cards(page).first()).toBeVisible();
  });

  test('the Studio\'s Page DNA leads to the poems of the passage you are on', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await page.getByRole('link', { name: 'Read these poems in Discover →' }).click();

    await expect(page).toHaveURL(/\/discover#passage=walden-woods$/);
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(9);
  });

  test('the Studio\'s link follows the passage: Dorian Gray leads to Dorian Gray', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'The Picture of Dorian Gray').click();
    await page.getByRole('link', { name: 'Read these poems in Discover →' }).click();
    await expect(passageButton(page, 'The Picture of Dorian Gray')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(7);
  });

  test('Discover leads back to the Studio and Home', async ({ page }) => {
    await openDiscover(page);
    await page.getByRole('link', { name: 'Studio', exact: true }).click();
    await expect(page).toHaveURL(/\/studio/);
    await page.goBack();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Discover keeps its passage in the address', () => {
  test('a link with a passage opens on it', async ({ page }) => {
    await openDiscover(page, '#passage=dorian-gray-ch1');
    await expect(passageButton(page, 'The Picture of Dorian Gray')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(7);
  });

  test('choosing a passage updates the address, so a reload comes back to it', async ({ page }) => {
    await openDiscover(page);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');

    await passageButton(page, 'Walden').click();
    await expect(cards(page)).toHaveCount(9);
    await expect(page).toHaveURL(/#passage=walden-woods$/);

    await page.reload();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(cards(page)).toHaveCount(9);
  });

  test('ignores a passage it does not have, and other hashes', async ({ page }) => {
    for (const hash of ['#passage=no-such-book', '#passage=', '#main', '#found=walden-woods:14-28:16,23']) {
      await openDiscover(page, hash);
      await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
      await expect(cards(page)).toHaveCount(8);
    }
  });

  test('says aloud how many poems there are when the passage changes', async ({ page }) => {
    await openDiscover(page);
    const announcement = page.getByRole('status').filter({ hasText: 'to find in' });
    await expect(announcement).toHaveText('8 poems to find in Jane Eyre.');

    await passageButton(page, 'The Picture of Dorian Gray').click();
    await expect(announcement).toHaveText('7 poems to find in The Picture of Dorian Gray.');
    await passageButton(page, 'Walden').click();
    await expect(announcement).toHaveText('9 poems to find in Walden.');
  });
});

test.describe('keyboard and screen reader', () => {
  test('Discover is reached in a sensible order: skip link, header, passages, strip, then the first poem', async ({ page, browserName }) => {
    await openDiscover(page);
    const links = linksInTabOrder(browserName);
    const expected = [
      ...(links ? ['Skip to main content', 'Home', 'Studio'] : []),
      'Jane Eyre',
      'Walden',
      'The Picture of Dorian Gray',
      ...Array.from({ length: 8 }, (_, i) => `Go to poem ${i + 1}`),
      ...(links ? ['Open poem 1 in the editor'] : []),
      '1 other way to read this',
    ];
    const seen: string[] = [];
    for (let i = 0; i < expected.length; i++) {
      await page.keyboard.press('Tab');
      seen.push(await focusedName(page));
    }
    expect(seen).toEqual(expected);
  });

  test('every control in the list has a name that says which poem it belongs to', async ({ page }) => {
    await openDiscover(page, '#passage=walden-woods');
    const names = await page
      .getByRole('main')
      .locator('a, button')
      .evaluateAll(els => els.map(el => el.getAttribute('aria-label') || (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
    // No bare "Open in editor" that a screen-reader user could not tell apart.
    expect(names.filter(name => /^Open in editor$/i.test(name))).toEqual([]);
    expect(names.filter(name => name === '')).toEqual([]);
    expect(new Set(names.filter(n => /^Open (poem|variant)/.test(n))).size).toBe(
      names.filter(n => /^Open (poem|variant)/.test(n)).length
    ); // all distinct
  });

  test('the headings are in order: one h1, then a heading for the count and for each poem', async ({ page }) => {
    await openDiscover(page, '#passage=walden-woods');
    const headings = await page.getByRole('heading').evaluateAll(els => els.map(el => [el.tagName, (el.textContent ?? '').trim()]));
    expect(headings[0]).toEqual(['H1', 'Poems hiding in the text']);
    expect(headings[1]).toEqual(['H2', '9 poems to find']);
    expect(headings.slice(2).map(h => h[1])).toEqual(Array.from({ length: 9 }, (_, i) => `Poem ${i + 1}`));
    expect(headings.every(h => h[0] === 'H1' || h[0] === 'H2')).toBe(true);
  });
});

test.describe('readable and easy to hit', () => {
  test('the numbers on the strip have enough contrast to read', async ({ page }) => {
    await openDiscover(page, '#passage=walden-woods');
    const ratios = await strip(page).locator('[data-poem] span').evaluateAll(spans => {
      const toRgb = (css: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b];
      };
      const luminance = ([r, g, b]: number[]) => {
        const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      return spans.map(span => {
        const style = getComputedStyle(span);
        const [a, b] = [luminance(toRgb(style.color)), luminance(toRgb(style.backgroundColor))].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      });
    });
    expect(ratios).toHaveLength(9);
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('every control on Discover is at least 24 by 24 pixels', async ({ page }) => {
    await openDiscover(page, '#passage=walden-woods');
    // Open a list of variants too, so its links are measured.
    await cards(page).nth(1).getByRole('button', { name: /3 other ways/ }).click();

    const small = await page.getByRole('main').locator('a, button').evaluateAll(els =>
      els
        .map(el => ({ label: el.getAttribute('aria-label') || (el.textContent ?? '').trim(), box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 24 || box.height < 24))
        .map(({ label, box }) => `${label}: ${Math.round(box.width)}x${Math.round(box.height)}`)
    );
    expect(small).toEqual([]);
  });

  test('the same holds on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDiscover(page, '#passage=walden-woods');
    const small = await page.getByRole('main').locator('a, button').evaluateAll(els =>
      els
        .map(el => ({ label: el.getAttribute('aria-label') || (el.textContent ?? '').trim(), box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < 24 || box.height < 24))
        .map(({ label, box }) => `${label}: ${Math.round(box.width)}x${Math.round(box.height)}`)
    );
    expect(small).toEqual([]);
  });
});
