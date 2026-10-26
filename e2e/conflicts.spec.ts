import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY, keepFirstWords, keptWords, openCollection, openStudio, pageWords, saveDraft } from './helpers';

// Two tabs of one browser share one collection. These tests are those two tabs.

const CONFLICT = 'This poem was changed somewhere else, for example in another tab. Open it again from My Collection to see the latest version.';
const GONE = 'This poem was deleted somewhere else, so it was not saved. You can save it again as a new poem.';

const panel = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const saveForm = (page: Page) => page.getByRole('dialog', { name: 'Save Poem Draft' });
const stored = (page: Page) =>
  page.evaluate(key => Object.values(JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, Record<string, unknown>>), STORAGE_KEY);

async function openSaved(page: Page, title: string) {
  await openCollection(page);
  await panel(page).getByRole('button', { name: new RegExp(title) }).first().click();
  await expect(page.getByText(`Editing: "${title}"`)).toBeVisible();
}

/** Tab A saves a poem and tab B opens it. Returns both tabs. */
async function twoTabsOnOnePoem(page: Page) {
  await openStudio(page);
  await keepFirstWords(page, 3);
  await saveDraft(page, 'Shared');
  await expect(page.getByText('Draft "Shared" saved.')).toBeVisible();

  const tabB = await page.context().newPage();
  await openStudio(tabB);
  await openSaved(tabB, 'Shared');
  await expect(keptWords(tabB)).toHaveCount(3);
  return { tabA: page, tabB };
}

test.describe('the same poem open in two tabs', () => {
  test('the second tab to save is told, keeps its words, and the first tab’s version stays', async ({ page }) => {
    const { tabA, tabB } = await twoTabsOnOnePoem(page);

    // Tab A changes the poem and saves it again.
    await pageWords(tabA).nth(3).click();
    await saveDraft(tabA, 'Shared by A');
    await expect(tabA.getByText('Draft "Shared by A" saved.')).toBeVisible();
    expect((await stored(tabA))[0]).toMatchObject({ title: 'Shared by A', revision: 2 });

    // Tab B, still on revision 1, changes it differently and tries to save.
    await pageWords(tabB).nth(5).click();
    await expect(keptWords(tabB)).toHaveCount(4);
    await saveDraft(tabB, 'Shared by B');
    await expect(saveForm(tabB).getByRole('alert')).toHaveText(CONFLICT);

    // Nothing was overwritten, and what tab B had typed is still there to copy.
    const poems = await stored(tabB);
    expect(poems).toHaveLength(1);
    expect(poems[0]).toMatchObject({ title: 'Shared by A', revision: 2 });
    expect(poems[0].retainedTokenIds).toHaveLength(4);
    await expect(saveForm(tabB).getByLabel('Poem Title')).toHaveValue('Shared by B');
    await saveForm(tabB).getByRole('button', { name: 'Cancel' }).click();
    await expect(keptWords(tabB)).toHaveCount(4);
  });

  test('opening it again from My Collection shows the latest, and saving then works', async ({ page }) => {
    const { tabA, tabB } = await twoTabsOnOnePoem(page);
    await pageWords(tabA).nth(3).click();
    await saveDraft(tabA, 'Shared by A');
    await expect(tabA.getByText('Draft "Shared by A" saved.')).toBeVisible();

    await saveDraft(tabB, 'Shared by B');
    await expect(saveForm(tabB).getByRole('alert')).toHaveText(CONFLICT);
    await saveForm(tabB).getByRole('button', { name: 'Cancel' }).click();

    // B opens the poem again, then saves from the new revision.
    await openCollection(tabB);
    await panel(tabB).getByRole('button', { name: /Shared by A/ }).first().click();
    await expect(tabB.getByText('Editing: "Shared by A"')).toBeVisible();
    await expect(keptWords(tabB)).toHaveCount(4);

    await pageWords(tabB).nth(6).click();
    await saveDraft(tabB, 'Shared by B');
    await expect(tabB.getByText('Draft "Shared by B" saved.')).toBeVisible();
    expect((await stored(tabB))[0]).toMatchObject({ title: 'Shared by B', revision: 3 });
    expect((await stored(tabB))[0].retainedTokenIds).toHaveLength(5);
  });

  test('the tab that saved keeps saving without trouble, revision after revision', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 3);
    for (let i = 1; i <= 3; i++) {
      await saveDraft(page, `Round ${i}`);
      await expect(page.getByText(`Draft "Round ${i}" saved.`)).toBeVisible();
    }
    const poems = await stored(page);
    expect(poems).toHaveLength(1);
    expect(poems[0]).toMatchObject({ title: 'Round 3', revision: 3 });
  });

  test('a poem deleted in the other tab is reported, not brought back; saving again makes a new poem', async ({ page }) => {
    const { tabA, tabB } = await twoTabsOnOnePoem(page);

    // Tab A deletes it from My Collection.
    await openCollection(tabA);
    await tabA.getByRole('button', { name: 'Delete draft Shared' }).click();
    await tabA.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    expect(await stored(tabA)).toHaveLength(0);

    // Tab B saves what it has.
    await pageWords(tabB).nth(5).click();
    await saveDraft(tabB, 'Shared');
    await expect(saveForm(tabB).getByRole('alert')).toHaveText(GONE);
    expect(await stored(tabB)).toHaveLength(0); // not brought back
    await expect(saveForm(tabB).getByLabel('Poem Title')).toHaveValue('Shared');

    // Saving again from the same form makes a new poem, with the words still there.
    await saveForm(tabB).getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(tabB.getByText('Draft "Shared" saved.')).toBeVisible();
    const poems = await stored(tabB);
    expect(poems).toHaveLength(1);
    expect(poems[0]).toMatchObject({ title: 'Shared', revision: 1 });
    expect(poems[0].retainedTokenIds).toHaveLength(4);
  });
});

test.describe('renaming from a collection list that is out of date', () => {
  test('is refused with the same message, and the list shows the poem as it is now', async ({ page }) => {
    const { tabA, tabB } = await twoTabsOnOnePoem(page);
    await openCollection(tabB); // tab B's list now shows revision 1

    await pageWords(tabA).nth(3).click();
    await saveDraft(tabA, 'Changed in A');
    await expect(tabA.getByText('Draft "Changed in A" saved.')).toBeVisible();

    await tabB.getByRole('button', { name: 'Rename draft Shared' }).click();
    await panel(tabB).getByLabel('New title for “Shared”').fill('Renamed in B');
    await tabB.keyboard.press('Enter');
    await expect(panel(tabB).getByRole('status').or(panel(tabB).getByRole('alert')).filter({ hasText: CONFLICT })).toBeVisible();
    await expect(panel(tabB).getByRole('listitem').filter({ hasText: 'Changed in A' })).toBeVisible();
    expect((await stored(tabB))[0]).toMatchObject({ title: 'Changed in A', revision: 2 });
  });

  test('renaming the open poem from the collection does not make the next save a conflict', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 3);
    await saveDraft(page, 'Before');
    await expect(page.getByText('Draft "Before" saved.')).toBeVisible();

    await openCollection(page);
    await page.getByRole('button', { name: 'Rename draft Before' }).click();
    await panel(page).getByLabel('New title for “Before”').fill('After');
    await page.keyboard.press('Enter');
    await expect(panel(page).getByRole('status')).toHaveText('Renamed to “After”.');
    await panel(page).getByRole('button', { name: 'Close Collection', exact: true }).click();
    await expect(panel(page)).toBeHidden();

    await pageWords(page).nth(4).click();
    await saveDraft(page, 'After again');
    await expect(page.getByText('Draft "After again" saved.')).toBeVisible();
    expect((await stored(page))[0]).toMatchObject({ title: 'After again', revision: 3 });
  });

  test('a rename that follows a change made elsewhere does not hide that change from the next save', async ({ page }) => {
    const { tabA, tabB } = await twoTabsOnOnePoem(page);
    await pageWords(tabA).nth(3).click();
    await saveDraft(tabA, 'Changed in A');
    await expect(tabA.getByText('Draft "Changed in A" saved.')).toBeVisible();

    // Tab B opens its list only now, so it shows A's revision, and renames from there. That works...
    await openCollection(tabB);
    await tabB.getByRole('button', { name: 'Rename draft Changed in A' }).click();
    await panel(tabB).getByLabel('New title for “Changed in A”').fill('Renamed in B');
    await tabB.keyboard.press('Enter');
    await expect(panel(tabB).getByRole('status')).toHaveText('Renamed to “Renamed in B”.');
    await panel(tabB).getByRole('button', { name: 'Close Collection', exact: true }).click();

    // ...but tab B's page is still the poem before A's change, so saving it must not overwrite A's words.
    await saveDraft(tabB, 'Renamed in B');
    await expect(saveForm(tabB).getByRole('alert')).toHaveText(CONFLICT);
    expect((await stored(tabB))[0].retainedTokenIds).toHaveLength(4);
  });
});
