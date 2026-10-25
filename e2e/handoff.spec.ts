import { test, expect, type Page } from '@playwright/test';
import {
  keptText,
  keptWords,
  openCollection,
  openStudio,
  pageWords,
  passageButton,
  poemLines,
  saveDraft,
  styleButton,
  viewToggle,
} from './helpers';

// Links Discover will build for the poems it lists. They are checked against the library in
// tests/unit/foundHandoff.test.ts, so each of these opens the poem it is written next to.
const WALDEN_1 = 'found=walden-woods:14-28:16,23';
const WALDEN_2 = 'found=walden-woods:24-38:28,35';
const JANE_3 = 'found=jane-eyre-ch1:54-66:55,61';
const DORIAN_1 = 'found=dorian-gray-ch1:2-15:6,11';

const WALDEN_1_WORDS = 'the essential facts of life, and see if I could not learn what it had';
const WALDEN_1_LINES = ['the essential facts', 'of life, and see if I could', 'not learn what it had'];

const notice = (page: Page, text: string | RegExp) =>
  page.getByRole('status').filter({ hasText: text });
const alert = (page: Page, text: string | RegExp) => page.getByRole('alert').filter({ hasText: text });

test.describe('opening a poem sent from Discover', () => {
  test('opens the passage with exactly the poem\'s words kept, and its line breaks', async ({ page }) => {
    await page.goto(`/studio#${WALDEN_1}`);
    await expect(page.locator('article')).toBeVisible();

    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(page)).toBe(WALDEN_1_WORDS);
    await expect(keptWords(page)).toHaveCount(15);
    await expect(page.getByRole('status').filter({ hasText: '15 words kept, 198 erased.' })).toHaveCount(1);
    await expect(styleButton(page, /Blackout/)).toHaveAttribute('aria-pressed', 'true');

    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual(WALDEN_1_LINES);

    // It is the Studio's ordinary state, so the rest of the screen agrees.
    await expect(page.getByRole('complementary', { name: 'Studio controls' }).getByText('9 poems to find')).toBeVisible();
  });

  test('says where the poem came from, and takes the link out of the address bar', async ({ page }) => {
    await page.goto(`/studio#${WALDEN_1}`);
    await expect(notice(page, 'Opened a poem found in Walden. Edit it, then save it to your collection.')).toBeVisible();
    await expect(page).toHaveURL(/\/studio$/);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
  });

  test('a reload starts the Studio fresh instead of reapplying the link', async ({ page }) => {
    await page.goto(`/studio#${WALDEN_1}`);
    await expect(keptWords(page)).toHaveCount(15);

    await page.reload();
    await expect(page.locator('article')).toBeVisible();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(237); // every word kept, as on any fresh start
    await expect(page.getByText('Opened a poem found in')).toHaveCount(0);
  });

  test('keeps the punctuation exactly as written, including a sentence end inside the poem', async ({ page }) => {
    await page.goto(`/studio#${JANE_3}`);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(page)).toBe('outdoor exercise was now out of the question. I was glad of it:');
    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual(['outdoor exercise', 'was now out of the question.', 'I was glad of it:']);
  });

  test('is an ordinary poem: editable, savable, and it reopens from My Collection as it was', async ({ page }) => {
    await page.goto(`/studio#${WALDEN_1}`);
    await expect(keptWords(page)).toHaveCount(15);

    await saveDraft(page, 'Found in Walden', 'From Discover');
    await expect(notice(page, 'Draft "Found in Walden" saved.')).toBeVisible();

    await page.reload();
    await openCollection(page);
    await page.getByRole('dialog').getByRole('button', { name: /Found in Walden/ }).first().click();

    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(page)).toBe(WALDEN_1_WORDS);
    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual(WALDEN_1_LINES);
  });

  test('can be edited after opening, and undone', async ({ page }) => {
    await page.goto(`/studio#${WALDEN_1}`);
    await expect(keptWords(page)).toHaveCount(15);

    await pageWords(page).nth(15).click(); // erase "essential"
    await expect(keptWords(page)).toHaveCount(14);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(keptWords(page)).toHaveCount(15);
  });

  test('opens a link while the Studio is already showing, replacing what was on screen', async ({ page }) => {
    await openStudio(page);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');

    // Changing only the hash does not reload the page; the Studio listens for it.
    await page.evaluate(hash => { window.location.hash = hash; }, DORIAN_1);
    await expect(passageButton(page, 'The Picture of Dorian Gray')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(page)).toBe('was filled with the rich odour of roses, and when the light summer wind');
    await expect(notice(page, 'Opened a poem found in The Picture of Dorian Gray.')).toBeVisible();
    expect(await page.evaluate(() => window.location.hash)).toBe('');

    // And another one straight after.
    await page.evaluate(hash => { window.location.hash = hash; }, WALDEN_2);
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(page)).toBe('not learn what it had to teach, and not, when I came to die, discover');
  });
});

test.describe('links the Studio will not open', () => {
  const cases: [string, string, RegExp][] = [
    ['gibberish', 'found=garbage', /does not describe a poem the Studio can open/],
    ['a range that runs backwards', 'found=walden-woods:28-14:16,23', /does not describe a poem/],
    ['a line break after the last word', 'found=walden-woods:14-28:16,28', /does not describe a poem/],
    ['a passage that is not in the library', 'found=no-such-book:1-5:3', /no longer in the library/],
    ['words that are not in the passage', 'found=walden-woods:9000-9010:', /no longer matches the current text/],
    ['a line break outside the poem', 'found=walden-woods:14-28:16,9000', /does not describe a poem/],
  ];

  for (const [name, hash, message] of cases) {
    test(`refuses ${name} and leaves the Studio as it was`, async ({ page }) => {
      await page.goto(`/studio#${hash}`);
      await expect(page.locator('article')).toBeVisible();

      await expect(alert(page, message)).toBeVisible();
      await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
      await expect(keptWords(page)).toHaveCount(237);
      expect(await page.evaluate(() => window.location.hash)).toBe('');

      // Still a working Studio.
      await pageWords(page).first().click();
      await expect(keptWords(page)).toHaveCount(236);
    });
  }

  test('does not disturb the Studio when a bad link arrives while it is open', async ({ page }) => {
    await page.goto(`/studio#${WALDEN_1}`);
    await expect(keptWords(page)).toHaveCount(15);

    await page.evaluate(() => { window.location.hash = '#found=garbage'; });
    await expect(alert(page, /does not describe a poem/)).toBeVisible();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(15); // the open poem is untouched
  });

  test('ignores a hash that is not a hand-off', async ({ page }) => {
    await page.goto('/studio#section-2');
    await expect(page.locator('article')).toBeVisible();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(237);
    await expect(page.getByRole('alert').filter({ hasText: /Studio|poem/ })).toHaveCount(0);
    expect(await page.evaluate(() => window.location.hash)).toBe('#section-2');
  });
});
