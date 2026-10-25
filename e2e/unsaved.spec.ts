import { test, expect, type Page } from '@playwright/test';
import { keepFirstWords, keptWords, openCollection, openStudio, pageWords, passageButton, saveDraft } from './helpers';

const WALDEN_1 = 'found=walden-woods:14-28:16,23'; // fifteen words kept

const question = (page: Page) => page.getByRole('alertdialog', { name: 'Discard your unsaved changes?' });
const keepEditing = (page: Page) => question(page).getByRole('button', { name: 'Keep editing' });
const discard = (page: Page) => question(page).getByRole('button', { name: 'Discard changes' });

/** An edit: one word of the passage erased. */
async function edit(page: Page) {
  await pageWords(page).first().click();
}

test.describe('changes that are not saved', () => {
  test('are not asked about when there are none: switching passage just switches', async ({ page }) => {
    await openStudio(page);
    await passageButton(page, 'Walden').click();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(question(page)).toHaveCount(0);
  });

  test('switching passage asks first, naming where it is going, and Keep editing changes nothing', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await expect(keptWords(page)).toHaveCount(236);

    await passageButton(page, 'Walden').click();
    await expect(question(page)).toBeVisible();
    await expect(question(page)).toContainText("Switching to Walden will replace the poem you are editing, which has changes you haven't saved.");
    await expect(keepEditing(page)).toBeFocused(); // Enter by reflex loses nothing

    await keepEditing(page).click();
    await expect(question(page)).toHaveCount(0);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(236);
  });

  test('Escape means Keep editing', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await passageButton(page, 'Walden').click();
    await expect(question(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question(page)).toHaveCount(0);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(236);
  });

  test('Discard changes goes ahead, and the new passage starts fresh', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await passageButton(page, 'Walden').click();
    await discard(page).click();

    await expect(question(page)).toHaveCount(0);
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(213);
  });

  test('can be answered entirely from the keyboard', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await passageButton(page, 'Walden').focus();
    await page.keyboard.press('Enter');
    await expect(question(page)).toBeVisible();
    await page.keyboard.press('Tab'); // Keep editing -> Discard changes
    await expect(discard(page)).toBeFocused();
    await page.keyboard.press('Tab'); // wraps inside the question
    await expect(keepEditing(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(discard(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('when changes count as saved', () => {
  test('saving a draft makes the poem on screen the saved one', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 5);
    await saveDraft(page, 'Saved one');
    await expect(page.getByText('Draft "Saved one" saved.')).toBeVisible();

    await passageButton(page, 'Walden').click();
    await expect(question(page)).toHaveCount(0);
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a change after saving is a change again', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 5);
    await saveDraft(page, 'Saved one');
    await expect(page.getByText('Draft "Saved one" saved.')).toBeVisible();

    await pageWords(page).nth(7).click(); // keep one more word
    await passageButton(page, 'Walden').click();
    await expect(question(page)).toBeVisible();
  });

  test('undoing every change leaves nothing to lose', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(keptWords(page)).toHaveCount(237);
    await passageButton(page, 'Walden').click();
    await expect(question(page)).toHaveCount(0);
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a poem opened from Discover is not changed until you change it', async ({ page }) => {
    await page.goto(`/studio#${WALDEN_1}`);
    await expect(keptWords(page)).toHaveCount(15);
    await passageButton(page, 'Jane Eyre').click();
    await expect(question(page)).toHaveCount(0);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');

    await page.goto(`/studio#${WALDEN_1}`);
    await expect(keptWords(page)).toHaveCount(15);
    await keptWords(page).first().click();
    await passageButton(page, 'Jane Eyre').click();
    await expect(question(page)).toBeVisible();
  });
});

test.describe('opening another poem over unsaved changes', () => {
  async function savedDraftThenEdit(page: Page) {
    await openStudio(page);
    await keepFirstWords(page, 5);
    await saveDraft(page, 'First draft');
    await expect(page.getByText('Draft "First draft" saved.')).toBeVisible();
    await pageWords(page).nth(8).click(); // keep another word: 6 kept, 5 saved
    await expect(keptWords(page)).toHaveCount(6);
  }

  test('a draft from My Collection asks first, naming the draft, and Keep editing leaves the poem as it was', async ({ page }) => {
    await savedDraftThenEdit(page);
    await openCollection(page);
    await page.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('button', { name: /First draft/ }).first().click();

    await expect(question(page)).toContainText("Opening “First draft” will replace the poem you are editing, which has changes you haven't saved.");
    await keepEditing(page).click();
    await expect(keptWords(page)).toHaveCount(6);
  });

  test('Discard changes opens the draft as it was saved', async ({ page }) => {
    await savedDraftThenEdit(page);
    await openCollection(page);
    await page.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('button', { name: /First draft/ }).first().click();
    await discard(page).click();
    await expect(keptWords(page)).toHaveCount(5);
    await expect(page.getByText('Loaded draft "First draft"')).toBeVisible();
  });

  test('a draft opens straight away when nothing is unsaved', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 5);
    await saveDraft(page, 'Only draft');
    await expect(page.getByText('Draft "Only draft" saved.')).toBeVisible();
    await pageWords(page).first().click(); // erase a kept word...
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); // ...and undo it
    await openCollection(page);
    await page.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('button', { name: /Only draft/ }).first().click();
    await expect(question(page)).toHaveCount(0);
    await expect(page.getByText('Loaded draft "Only draft"')).toBeVisible();
  });

  test('a link to a poem, followed while the Studio is open, asks first', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await page.evaluate(hash => { window.location.hash = hash; }, WALDEN_1);
    await expect(question(page)).toContainText("Opening this poem will replace the one you are editing, which has changes you haven't saved.");

    await keepEditing(page).click();
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(236);

    await page.evaluate(hash => { window.location.hash = hash; }, WALDEN_1);
    await discard(page).click();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(15);
  });
});

test.describe('leaving the Studio', () => {
  for (const [name, href] of [['Home', '/'], ['Discover', '/discover'], ['Assisted', '/assist']] as const) {
    test(`by the ${name} link asks first when there are unsaved changes`, async ({ page }) => {
      await openStudio(page);
      await edit(page);
      await page.getByRole('link', { name, exact: true }).click();
      await expect(question(page)).toContainText("Leaving the Studio will lose the changes you haven't saved to the poem you are editing.");
      await expect(page).toHaveURL(/\/studio$/);

      await keepEditing(page).click();
      await expect(page).toHaveURL(/\/studio$/);
      await expect(keptWords(page)).toHaveCount(236);

      await page.getByRole('link', { name, exact: true }).click();
      await discard(page).click();
      await expect(page).toHaveURL(new RegExp(`${href === '/' ? '/$' : href}`));
    });
  }

  test('the link under the Page DNA asks too', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await page.getByRole('link', { name: 'Read these poems in Discover →' }).click();
    await expect(question(page)).toBeVisible();
    await discard(page).click();
    await expect(page).toHaveURL(/\/discover#passage=jane-eyre-ch1/);
  });

  test('is free when nothing is unsaved', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL(/\/discover/);
    await expect(question(page)).toHaveCount(0);
  });

  test('a link opened in a new tab is left alone', async ({ page }) => {
    await openStudio(page);
    await edit(page);
    await page.getByRole('link', { name: 'Discover', exact: true }).click({ modifiers: ['Control'] });
    await expect(question(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/studio$/);
  });

  test('closing the tab with nothing unsaved gets no warning', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium reports the warning to the test');
    await openStudio(page);
    let warned = false;
    page.on('dialog', dialog => {
      warned = true;
      void dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => page.isClosed()).toBe(true); // it closed by itself
    expect(warned).toBe(false);
  });

  test('closing the tab with unsaved changes brings up the warning from the browser itself', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium reports the warning to the test');
    await openStudio(page);
    await edit(page);
    const warning = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialog = await warning;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss(); // stay on the page
    expect(page.isClosed()).toBe(false);
    await expect(keptWords(page)).toHaveCount(236);
  });
});

test('the question fits and can be touched on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page);
  await edit(page);
  await passageButton(page, 'Walden').click();
  await expect(question(page)).toBeVisible();
  const box = (await question(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const button of [keepEditing(page), discard(page)]) {
    const b = (await button.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(24);
    expect(b.height).toBeGreaterThanOrEqual(24);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
