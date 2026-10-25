import { test, expect } from '@playwright/test';
import {
  draft,
  keepFirstWords,
  keptText,
  keptWords,
  openCollection,
  openStudio,
  pageWords,
  passageButton,
  poemLines,
  readPng,
  saveDraft,
  seedDrafts,
  STORAGE_KEY,
  styleButton,
  viewToggle,
} from './helpers';

const WALDEN_OPENING = 'I went to the woods because I wished to live deliberately,';

test.describe('create, save, reopen', () => {
  test('a poem survives saving, reloading and reopening from My Collection', async ({ page }) => {
    await openStudio(page);

    // Create: keep the first eleven words of Walden, in faded ink, with line breaks.
    await passageButton(page, 'Walden').click();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await keepFirstWords(page, 11);
    await styleButton(page, /Faded Ink/).click();
    await expect(styleButton(page, /Faded Ink/)).toHaveAttribute('aria-pressed', 'true');

    await viewToggle(page, 'Extracted poem').click();
    const poemWords = page.getByRole('group', { name: 'Poem text' }).getByRole('button');
    await poemWords.nth(3).click(); // after "the"
    await poemWords.nth(5).click(); // after "because"
    expect(await poemLines(page)).toEqual([
      'I went to the',
      'woods because',
      'I wished to live deliberately,',
    ]);

    // Save with a title and notes.
    await saveDraft(page, 'Pond Poem', 'Written by the pond');
    await expect(page.getByRole('status').filter({ hasText: 'Draft "Pond Poem" saved.' })).toBeVisible();
    await expect(page.getByText('Editing: "Pond Poem"')).toBeVisible();

    // Reload: everything is gone from the screen, but the draft is in storage.
    await page.reload();
    await expect(page.locator('article, [aria-label="Poem text"]').first()).toBeVisible();
    await expect(page.getByText('Editing:')).toHaveCount(0);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');

    // Reopen from My Collection.
    await openCollection(page);
    await expect(page.getByRole('dialog').getByText('Pond Poem')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /Pond Poem/ }).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(page.getByText('Editing: "Pond Poem"')).toBeVisible();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(styleButton(page, /Faded Ink/)).toHaveAttribute('aria-pressed', 'true');

    // The same words, the same line breaks, the same notes.
    await viewToggle(page, 'In the page').click();
    expect(await keptText(page)).toBe(WALDEN_OPENING);
    await viewToggle(page, 'Extracted poem').click();
    expect(await poemLines(page)).toEqual([
      'I went to the',
      'woods because',
      'I wished to live deliberately,',
    ]);
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await expect(page.getByLabel('Poem Title')).toHaveValue('Pond Poem');
    await expect(page.getByLabel(/Notes/)).toHaveValue('Written by the pond');
  });

  test('saving again updates the same draft instead of creating a second one', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 4);
    await saveDraft(page, 'First title');
    await expect(page.getByText('Editing: "First title"')).toBeVisible();

    await pageWords(page).nth(4).click();
    await saveDraft(page, 'Second title');
    await expect(page.getByText('Editing: "Second title"')).toBeVisible();

    await openCollection(page);
    const cards = page.getByRole('dialog').locator('li');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Second title');
    await expect(cards.first()).toContainText('5 words');
  });

  test('deleting a draft removes it from the collection after confirmation', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 3);
    await saveDraft(page, 'Doomed');

    await openCollection(page);
    page.once('dialog', dialog => dialog.accept()); // the confirm() prompt
    await page.getByRole('button', { name: 'Delete draft Doomed' }).click();
    await expect(page.getByText('No drafts yet')).toBeVisible();
  });
});

test.describe('unreadable drafts', () => {
  const retained = ['walden-woods-token-0000', 'walden-woods-token-0003'];

  test('refuses stale or orphaned drafts, hides unreadable ones, and opens the good one', async ({
    page,
  }) => {
    await seedDrafts(page, {
      good: draft({ id: 'good', passageId: 'walden-woods', title: 'Good Walden', retainedTokenIds: retained }),
      stale: draft({ id: 'stale', passageId: 'walden-woods', title: 'Stale Tokens', retainedTokenIds: ['walden-woods-token-9999'] }),
      ghost: draft({ id: 'ghost', passageId: 'no-such-passage', title: 'Lost Passage', retainedTokenIds: ['no-such-passage-token-0001'] }),
      future: draft({ id: 'future', schemaVersion: 99, passageId: 'walden-woods', title: 'From The Future', retainedTokenIds: [] }),
      junk: 'not even an object',
    });
    await openStudio(page);

    await openCollection(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('li')).toHaveCount(3);
    await expect(dialog).not.toContainText('From The Future');

    // A draft whose tokens no longer exist is refused, and the page stays as it was.
    await dialog.getByRole('button', { name: /Stale Tokens/ }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: 'no longer matches the current text' })).toBeVisible();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');

    // So is a draft whose passage is not in the library.
    await openCollection(page);
    await page.getByRole('dialog').getByRole('button', { name: /Lost Passage/ }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: 'no longer in the library' })).toBeVisible();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');

    // The good draft opens.
    await openCollection(page);
    await page.getByRole('dialog').getByRole('button', { name: /Good Walden/ }).first().click();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(2);

    // Unreadable entries were never deleted from storage.
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
    expect(Object.keys(stored).sort()).toEqual(['future', 'ghost', 'good', 'junk', 'stale']);
  });

  test('tells the user when the browser refuses to store the draft', async ({ page }) => {
    await page.addInitScript(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name: string, value: string) {
        if (name === key) throw new DOMException('quota', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    }, STORAGE_KEY);
    await openStudio(page);
    await keepFirstWords(page, 3);

    await saveDraft(page, 'Will not fit');
    const dialog = page.getByRole('dialog', { name: 'Save Poem Draft' });
    await expect(dialog.getByRole('alert')).toContainText('browser storage');
    await expect(dialog).toBeVisible(); // stays open so nothing is lost
    await expect(page.getByRole('status').filter({ hasText: 'saved' })).toHaveCount(0);
  });
});

test.describe('export', () => {
  const sizeOfFrame = async (page: import('@playwright/test').Page, view: 'page' | 'poem') => {
    const frame =
      view === 'page'
        ? page.locator('article').locator('xpath=..')
        : page.getByRole('group', { name: 'Poem text' }).locator('xpath=../..');
    return (await frame.boundingBox())!;
  };

  const STYLES = [
    ['blackout', /Blackout/],
    ['faded', /Faded Ink/],
    ['whiteout', /Whiteout/],
  ] as const;

  test('exports the page as a PNG at twice the size, in each erasure style', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await keepFirstWords(page, 11);
    const exportButton = page.getByRole('button', { name: 'Export page as PNG' });

    for (const [label, style] of STYLES) {
      await styleButton(page, style).click();
      // The page's height depends on the style (erased words are padded differently), so
      // measure it for this style rather than once.
      const box = await sizeOfFrame(page, 'page');
      const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
      expect(download.suggestedFilename()).toBe('palimpsest-walden-where-i-lived-and-what-i-lived-for-page.png');

      const png = await readPng(page, download);
      expect(Math.abs(png.width - box.width * 2), `${label} width`).toBeLessThanOrEqual(2);
      expect(Math.abs(png.height - box.height * 2), `${label} height`).toBeLessThanOrEqual(2);
      await expect(page.getByRole('status').filter({ hasText: 'Page exported as PNG.' })).toBeVisible();
    }
  });

  test('each erasure style looks like itself in the PNG, even when exported mid-transition', async ({
    page,
  }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await keepFirstWords(page, 11);

    // Make every transition last 10s. On a fast machine a style change finishes easing before
    // the export starts, which hides the bug this guards against: a snapshot that captures an
    // erasure style half-way between two looks (faded ink exported as blackout).
    await page.addStyleTag({ content: '*, *::before, *::after { transition-duration: 10s !important; }' });
    const exportButton = page.getByRole('button', { name: 'Export page as PNG' });
    const looks: Record<string, Awaited<ReturnType<typeof readPng>>> = {};

    for (const [label, style] of STYLES) {
      await styleButton(page, style).click();
      const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
      looks[label] = await readPng(page, download);
    }

    // Blackout is mostly ink bars; faded ink is not; whiteout paints pure-white tape.
    expect(looks.blackout.dark).toBeGreaterThan(0.25);
    expect(looks.blackout.white).toBeLessThan(0.05);
    expect(looks.faded.dark).toBeLessThan(0.05);
    expect(looks.faded.white).toBeLessThan(0.05);
    expect(looks.whiteout.dark).toBeLessThan(0.05);
    expect(looks.whiteout.white).toBeGreaterThan(0.2);
  });

  test('exports the extracted poem under the poem title', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 6);
    await saveDraft(page, 'Quiet Woods');
    await viewToggle(page, 'Extracted poem').click();
    const box = await sizeOfFrame(page, 'poem');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export poem as PNG' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('palimpsest-quiet-woods-poem.png');
    const png = await readPng(page, download);
    expect(Math.abs(png.width - box.width * 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(png.height - box.height * 2)).toBeLessThanOrEqual(2);
    await expect(page.getByRole('status').filter({ hasText: 'Poem exported as PNG.' })).toBeVisible();
  });
});

test('the old /prototype address redirects to the Studio', async ({ page }) => {
  await page.goto('/prototype');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.locator('article')).toBeVisible();
});
