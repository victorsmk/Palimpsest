import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { keepFirstWords, openStudio, poemLines, saveDraft, viewToggle } from './helpers';

/** Keeps six words, titles the poem and breaks it after the third word, so there are two lines. */
async function composePoem(page: Page, notes = '') {
  await openStudio(page);
  await keepFirstWords(page, 6);
  await saveDraft(page, 'Quiet Woods', notes);
  await viewToggle(page, 'Extracted poem').click();
  await page.getByRole('group', { name: 'Poem text' }).getByRole('button').nth(2).click();
  const lines = await poemLines(page);
  expect(lines).toHaveLength(2);
  return lines;
}

const exportGroup = (page: Page) => page.getByRole('group', { name: 'Export your poem' });

test.describe('exporting the poem', () => {
  test('downloads plain text with the title, the lines as broken, and the source', async ({ page }) => {
    const lines = await composePoem(page, 'a private note');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportGroup(page).getByRole('button', { name: 'Download as text (.txt)' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('palimpsest-quiet-woods-poem.txt');
    await expect(page.getByRole('status').filter({ hasText: 'Poem downloaded as text.' })).toBeVisible();

    const fileLines = readFileSync(await download.path(), 'utf8').split('\n');
    expect(fileLines.slice(0, 5)).toEqual(['Quiet Woods', '', lines[0], lines[1], '']);
    expect(fileLines[5]).toMatch(/^Found in .+, .+ \(\d{4}\)$/);
    expect(fileLines[6]).toMatch(/^Source: Project Gutenberg, https:\/\/www\.gutenberg\.org\//);
    expect(fileLines.join('\n')).not.toContain('a private note'); // notes stay out of the shareable text
  });

  test('the files hold exactly the words that are kept, in order', async ({ page }) => {
    await composePoem(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportGroup(page).getByRole('button', { name: 'Download as text (.txt)' }).click(),
    ]);
    const body = readFileSync(await download.path(), 'utf8').split('\n').slice(2, 4).join(' ');
    await viewToggle(page, 'In the page').click();
    const kept = (await page.locator('article button[data-token-id][aria-pressed="true"]').allInnerTexts()).join(' ');
    expect(body.replace(/\s+/g, ' ')).toBe(kept.replace(/\s+/g, ' '));
  });

  test('a newer message is not dismissed early by the timer of an older one', async ({ page }) => {
    await composePoem(page);
    const group = exportGroup(page);
    await group.getByRole('button', { name: 'Download as text (.txt)' }).click();
    await page.waitForTimeout(2000);
    await group.getByRole('button', { name: 'Download as text (.txt)' }).click();
    // Messages last 3.5s: the first one's timer runs out about 1.5s from now, while this one has 3.5s.
    await page.waitForTimeout(2500);
    await expect(page.getByRole('status').filter({ hasText: 'Poem downloaded as text.' })).toBeVisible();
  });

  test('has nothing to export until a word is kept, and says so', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('button', { name: 'Erase All' }).click();
    const buttons = exportGroup(page).getByRole('button');
    await expect(buttons).toHaveCount(3);
    for (const button of await buttons.all()) await expect(button).toBeDisabled();
    await expect(page.getByText('Keep at least one word to export your poem.')).toBeVisible();

    await page.getByRole('button', { name: 'Restore All' }).click();
    for (const button of await buttons.all()) await expect(button).toBeEnabled();
  });

  test('Print / Save as PDF opens the print dialog', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => { (window as unknown as { printed: number }).printed++; };
    });
    await composePoem(page);
    await exportGroup(page).getByRole('button', { name: 'Print / Save as PDF' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  });

  test('printing shows only the poem: title, lines and source, none of the Studio', async ({ page }) => {
    const lines = await composePoem(page);
    const sheet = page.locator('[data-print-poem]');

    await expect(sheet).toBeHidden(); // not on screen
    await page.emulateMedia({ media: 'print' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Quiet Woods' })).toBeVisible();
    expect((await sheet.locator('p').allInnerTexts()).slice(0, 2)).toEqual(lines);
    await expect(sheet.getByText(/^Found in /)).toBeVisible();

    await expect(page.getByRole('main')).toBeHidden();
    await expect(page.locator('header')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Erase All' })).toBeHidden();

    await page.emulateMedia({ media: 'screen' });
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('Chromium can turn the printed page into a one-page PDF', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf() is a Chromium feature');
    await composePoem(page);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  });

  test('keeps the image export, as a quieter option', async ({ page }) => {
    await openStudio(page);
    await expect(page.getByRole('button', { name: 'Export page as PNG' })).toBeVisible();
    await viewToggle(page, 'Extracted poem').click();
    await expect(page.getByRole('button', { name: 'Export poem as PNG' })).toBeVisible();
  });
});
