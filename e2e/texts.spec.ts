import { test, expect, type Page } from '@playwright/test';
import { keepFirstWords, keptText, openCollection, pageWords, saveDraft } from './helpers';
import { makeDocx } from '../tests/helpers/docx';

// The reader's own texts: added from a file or pasted, corrected, deleted, and read in the pages like any book.

const para = (tag: string, n = 100) => `${Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ')}.`;
const longText = (tag = 'p') => Array.from({ length: 12 }, (_, i) => para(`${tag}${i}x`)).join('\n\n');

const alert = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });
const field = (page: Page, name: string | RegExp) => page.getByRole('textbox', { name });
const card = (page: Page, title: string) => page.getByRole('list', { name: 'Your texts' }).getByRole('listitem').filter({ hasText: title });

async function openTexts(page: Page) {
  await page.goto('/texts');
  await expect(page.getByRole('heading', { level: 1, name: 'Your own texts' })).toBeVisible();
}

async function addPasted(page: Page, title: string, body: string, author = '') {
  await page.getByRole('button', { name: 'Add a text' }).click();
  await field(page, 'Title').fill(title);
  if (author) await field(page, /^Author/).fill(author);
  await field(page, 'The text').fill(body);
  await page.getByRole('button', { name: 'Keep this text' }).click();
}

test.describe('adding a text', () => {
  test('pasted, it is counted, kept, listed, and still there after the page is reloaded', async ({ page }) => {
    await openTexts(page);
    await expect(page.getByText('You have not added any text yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add a text' }).click();
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await field(page, 'The text').fill(longText());
    await expect(page.getByText('1,200 words, in 3 excerpts of about 450 words.')).toBeVisible();
    await field(page, 'Title').fill('The Long Walk');
    await field(page, /^Author/).fill('A. Writer');
    await page.getByRole('button', { name: 'Keep this text' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Kept “The Long Walk”.' })).toBeVisible();
    await expect(card(page, 'The Long Walk')).toContainText('A. Writer · 1,200 words · 3 excerpts');
    await page.reload();
    await expect(card(page, 'The Long Walk')).toBeVisible();
  });

  test('from a .txt file: the words fill the box, the file name makes the title, and the text can be corrected before it is kept', async ({ page }) => {
    await openTexts(page);
    await page.getByRole('button', { name: 'Add a text' }).click();
    await page.getByLabel('A file from your computer').setInputFiles({ name: 'my_first-poem.txt', mimeType: 'text/plain', buffer: Buffer.from('The quick brown fox\r\njumps over the lazy dog.\r\n') });
    await expect(page.getByText('Read “my_first-poem.txt”')).toBeVisible();
    await expect(field(page, 'Title')).toHaveValue('my first poem');
    await expect(field(page, 'The text')).toHaveValue('The quick brown fox\njumps over the lazy dog.');
    await field(page, 'The text').fill('The quick brown fox\njumps over the sleepy dog.');
    await page.getByRole('button', { name: 'Keep this text' }).click();
    await expect(card(page, 'my first poem')).toContainText('1 excerpt');
    await expect(card(page, 'my first poem')).toContainText('The quick brown fox jumps over the sleepy dog.');
  });

  test('from a Word file, with a poem recognised as one', async ({ page }) => {
    await openTexts(page);
    await page.getByRole('button', { name: 'Add a text' }).click();
    const docx = Buffer.from(makeDocx(['Roses are red', 'Violets are blue', '', 'Sugar is sweet', 'And so are you']));
    await page.getByLabel('A file from your computer').setInputFiles({ name: 'Rhyme.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx });
    await expect(page.getByText('Read “Rhyme.docx”')).toBeVisible();
    await expect(field(page, 'Title')).toHaveValue('Rhyme');
    await expect(field(page, 'The text')).toHaveValue('Roses are red\nViolets are blue\n\nSugar is sweet\nAnd so are you');
    await expect(page.getByRole('radio', { name: /Poetry/ })).toBeChecked();
    await page.getByRole('button', { name: 'Keep this text' }).click();
    await expect(card(page, 'Rhyme')).toContainText('poetry');
  });

  test('says what is wrong with a file it cannot use, and with a text it will not keep', async ({ page }) => {
    await openTexts(page);
    await page.getByRole('button', { name: 'Add a text' }).click();
    const file = page.getByLabel('A file from your computer');
    await file.setInputFiles({ name: 'book.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(alert(page, 'PDF files cannot be read yet')).toBeVisible();
    await file.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from([0x25, 0x50, 0x00, 0x01, 0x02]) });
    await expect(alert(page, 'does not look like a text file')).toBeVisible();
    await file.setInputFiles({ name: 'broken.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('this is not a zip file at all, whatever the name says') });
    await expect(alert(page, 'Word (.docx)')).toBeVisible();

    await page.getByRole('button', { name: 'Keep this text' }).click();
    await expect(alert(page, 'Give the text a title')).toBeVisible();
    await field(page, 'Title').fill('Something');
    await page.getByRole('button', { name: 'Keep this text' }).click();
    await expect(alert(page, 'no text yet')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Your texts' })).toHaveCount(0);
  });
});

test.describe('changing and deleting a text', () => {
  test('edit changes the text, and the count of excerpts follows', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'Draft', longText());
    await expect(card(page, 'Draft')).toContainText('3 excerpts');
    await card(page, 'Draft').getByRole('button', { name: 'Edit “Draft”' }).click();
    await field(page, 'Title').fill('Final');
    await field(page, 'The text').fill('A short text now.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(card(page, 'Final')).toContainText('1 excerpt');
    await expect(card(page, 'Draft')).toHaveCount(0);
  });

  test('cancel leaves the text as it was', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'Keep me', 'Original words here.');
    await card(page, 'Keep me').getByRole('button', { name: 'Edit “Keep me”' }).click();
    await field(page, 'The text').fill('Changed my mind.');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(card(page, 'Keep me')).toContainText('Original words here.');
  });

  test('delete asks first, and then the text is gone for good', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'Doomed', 'Words to lose.');
    await card(page, 'Doomed').getByRole('button', { name: 'Delete “Doomed”' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(card(page, 'Doomed')).toBeVisible();
    await card(page, 'Doomed').getByRole('button', { name: 'Delete “Doomed”' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete text' }).click();
    await expect(card(page, 'Doomed')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('You have not added any text yet')).toBeVisible();
  });
});

test.describe('reading a text of your own', () => {
  test('opens in the Studio like a book, words to keep or erase, and says where it came from', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'The Long Walk', longText(), 'A. Writer');
    await card(page, 'The Long Walk').getByRole('link', { name: 'Open in the Studio' }).click();
    await expect(page).toHaveURL(/\/studio#passage=my-/);
    await expect(page.getByRole('heading', { level: 2, name: 'The Long Walk — Part 1 of 3' })).toBeVisible();
    await expect(page.getByText(/^A\. Writer \(\d{4}\)$/)).toBeVisible();
    await expect(page.getByText('Your own text, kept in this browser')).toBeVisible();
    await expect(page.getByText('Public domain source via')).toHaveCount(0);
    await expect(pageWords(page).first()).toHaveText('p0x0');

    await keepFirstWords(page, 3);
    expect(await keptText(page)).toBe('p0x0 p0x1 p0x2');
    // the switcher steps through the excerpts, and the bundled passages are still there to go back to
    await expect(page.getByText('excerpt 1 of 3')).toBeVisible();
    await page.getByRole('button', { name: /Next excerpt/ }).click();
    // the words just kept are unsaved: the Studio asks before leaving them
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'The Long Walk — Part 2 of 3' })).toBeVisible();
    await page.getByRole('button', { name: 'Walden', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Walden/ })).toBeVisible();
  });

  test('can be chosen from the window for changing the book, among the reader’s own texts', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'The Long Walk', longText());
    await addPasted(page, 'Another Text', 'A few words in it.');
    await card(page, 'The Long Walk').getByRole('link', { name: 'Open in the Studio' }).click();
    await page.getByRole('button', { name: 'Change book or excerpt' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Back|All books/ }).click().catch(() => {});
    await expect(dialog.getByText('Your own texts', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: /Another Text/ }).click();
    await dialog.getByRole('button', { name: /A few words in it/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Another Text' })).toBeVisible();
  });

  test('a poem made from it is kept in My Collection and opens again, even after the text has been corrected elsewhere in it', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'The Long Walk', longText());
    await card(page, 'The Long Walk').getByRole('link', { name: 'Open in the Studio' }).click();
    await keepFirstWords(page, 3);
    await saveDraft(page, 'A found poem');

    // Correct the last paragraph of the text: the first excerpt is untouched, so the poem still opens.
    await page.goto('/texts');
    await card(page, 'The Long Walk').getByRole('button', { name: 'Edit “The Long Walk”' }).click();
    const edited = [...Array.from({ length: 11 }, (_, i) => para(`p${i}x`)), para('changed')].join('\n\n');
    await field(page, 'The text').fill(edited);
    await expect(page.getByText(/Poems already made from the parts of this text that you leave as they are will go on working/)).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await openCollection(page);
    await page.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('listitem').filter({ hasText: 'A found poem' }).getByRole('button').first().click();
    await expect(page).toHaveURL(/\/studio/);
    await expect.poll(() => keptText(page)).toBe('p0x0 p0x1 p0x2');
  });

  test('a poem made from a part that was then changed cannot be opened, and says so', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'The Long Walk', longText());
    await card(page, 'The Long Walk').getByRole('link', { name: 'Open in the Studio' }).click();
    await keepFirstWords(page, 2);
    await saveDraft(page, 'Doomed poem');
    await page.goto('/texts');
    await card(page, 'The Long Walk').getByRole('button', { name: 'Edit “The Long Walk”' }).click();
    await field(page, 'The text').fill(longText('z'));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await openCollection(page);
    await expect(page.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('listitem').filter({ hasText: 'Doomed poem' })).toContainText('can no longer be shown');
  });

  test('is found in Discover and Assisted by the same link', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'Small', 'To be or not to be, that is the question. Whether tis nobler in the mind to suffer.');
    await card(page, 'Small').getByRole('link', { name: 'Find poems in it' }).click();
    await expect(page).toHaveURL(/\/discover#passage=my-/);
    await expect(page.getByRole('heading', { level: 1, name: 'Poems hiding in the text' })).toBeVisible();
    await expect(page.getByText('Small', { exact: true }).first()).toBeVisible();
    await page.goto('/texts');
    await card(page, 'Small').getByRole('link', { name: 'Erase with help' }).click();
    await expect(page).toHaveURL(/\/assist#passage=my-/);
    await expect(page.getByRole('heading', { level: 1, name: 'Poems you can erase your way to' })).toBeVisible();
  });

  test('a link to a text that is not in this browser says so instead of showing something else', async ({ page }) => {
    await page.goto('/studio#passage=my-abcdefgh-abc');
    await expect(page.getByRole('article')).toBeVisible(); // falls back to the first bundled passage
    await page.goto('/discover#passage=my-abcdefgh-abc');
    await expect(alert(page, 'could not be opened')).toBeVisible();
  });
});

test.describe('the page of your texts', () => {
  test('is reached from the home page and from the other pages, and has its place in the navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Your texts' }).click();
    await expect(page).toHaveURL(/\/texts$/);
    await expect(page.getByRole('navigation', { name: 'Pages' }).locator('[aria-current="page"]')).toHaveText('Your texts');
    await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Discover' }).click();
    await expect(page).toHaveURL(/\/discover/);
  });

  test('does not scroll sideways on a phone, with the form open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openTexts(page);
    await page.getByRole('button', { name: 'Add a text' }).click();
    await field(page, 'The text').fill(longText());
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
  });
});
