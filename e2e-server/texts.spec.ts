import type { Page } from '@playwright/test';
import { test, expect, signIn } from './fixture';
import { keepFirstWords, keptWords, openCollection } from '../e2e/helpers';

// The reader's own texts with an account: kept on the server so that they follow the reader to another browser, the
// texts of this browser copied across when they sign in, and what the page says about where they are.

const ME = 'me@example.org';
const YOU = 'you@example.org';

const para = (tag: string, n = 100) => `${Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ')}.`;
const longText = (tag = 'p') => Array.from({ length: 12 }, (_, i) => para(`${tag}${i}x`)).join('\n\n');

const field = (page: Page, name: string | RegExp) => page.getByRole('textbox', { name });
const card = (page: Page, title: string) => page.getByRole('list', { name: 'Your texts' }).getByRole('listitem').filter({ hasText: title });
const headerButton = (page: Page, name: 'Sign in' | 'Account') => page.locator('header').getByRole('button', { name, exact: true }).first();

async function openTexts(page: Page) {
  await page.goto('/texts');
  await expect(page.getByRole('heading', { level: 1, name: 'Your own texts' })).toBeVisible();
}

async function addPasted(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Add a text' }).click();
  await field(page, 'Title').fill(title);
  await field(page, 'The text').fill(body);
  await page.getByRole('button', { name: 'Keep this text' }).click();
}

const storedInBrowser = (page: Page) => page.evaluate(() => window.localStorage.getItem('palimpsest:user-texts:v1'));

/** What a new browser is: no sign-in and none of the texts kept here. */
async function newBrowser(page: Page) {
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

test.describe('signed in', () => {
  test('a text is kept in the account, not in this browser, and the page says so', async ({ page, server }) => {
    await openTexts(page);
    await expect(page.getByText('Kept in this browser only. Sign in, and they are kept in your account instead.')).toBeVisible();
    await signIn(page, ME);
    await expect(page.getByText('Kept in your account, so they are there in any browser you sign in on.')).toBeVisible();
    await expect(page.getByText('Your texts are kept in your account, on our server, where only you can read them')).toBeVisible();

    await addPasted(page, 'The Long Walk', longText());
    await expect(page.getByRole('status').filter({ hasText: 'Kept “The Long Walk”.' })).toBeVisible();
    await expect(card(page, 'The Long Walk')).toContainText('1,200 words · 3 excerpts');

    const onServer = await server.textsOf(ME).list();
    expect(onServer.map(t => [t.title, t.text.length > 6000])).toEqual([['The Long Walk', true]]);
    expect(await server.textsOf(YOU).list()).toEqual([]);
    expect(await storedInBrowser(page)).toBeNull(); // nothing of it was kept in this browser
  });

  test('is there in another browser, with its excerpts, and a poem made from it opens there', async ({ page, server }) => {
    await openTexts(page);
    await signIn(page, ME);
    await addPasted(page, 'Follows Me', longText('f'));
    await expect(card(page, 'Follows Me')).toBeVisible();
    await card(page, 'Follows Me').getByRole('link', { name: 'Open in the Studio' }).click();
    await expect(page.locator('article')).toBeVisible();
    await keepFirstWords(page, 3);
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await page.getByRole('dialog', { name: 'Save Poem Draft' }).getByLabel('Poem Title').fill('A poem from my text');
    await page.getByRole('dialog', { name: 'Save Poem Draft' }).getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Save Poem Draft' })).toHaveCount(0);

    await newBrowser(page); // signed out, nothing kept here
    await openTexts(page);
    await expect(page.getByText('You have not added any text yet')).toBeVisible();

    await signIn(page, ME);
    await expect(card(page, 'Follows Me')).toContainText('1,200 words · 3 excerpts');
    await card(page, 'Follows Me').getByRole('link', { name: 'Open in the Studio' }).click();
    await expect(page.locator('article')).toContainText('f0x0');
    await openCollection(page);
    await page.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('button', { name: /A poem from my text/ }).first().click();
    await expect(keptWords(page)).toHaveCount(3);
    expect(server.requests.some(r => r.method === 'POST' && r.path === '/api/texts')).toBe(true);
  });

  test('the text of another account is not there', async ({ page, server }) => {
    await server.textsOf(YOU).create('my-aaaaaaaa', { title: 'Yours', author: '', form: 'prose', text: 'Not for me to read.' });
    await openTexts(page);
    await signIn(page, ME);
    await expect(page.getByText('You have not added any text yet')).toBeVisible();
    await expect(page.getByText('Yours')).toHaveCount(0);
  });

  test('changing and deleting a text happen in the account, and the question says so', async ({ page, server }) => {
    await server.textsOf(ME).create('my-bbbbbbbb', { title: 'Before', author: 'X', form: 'prose', text: 'Old words here.' });
    await openTexts(page);
    await signIn(page, ME);
    await card(page, 'Before').getByRole('button', { name: 'Edit “Before”' }).click();
    await field(page, 'Title').fill('After');
    await field(page, 'The text').fill('New words here.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(card(page, 'After')).toBeVisible();
    expect((await server.textsOf(ME).list()).map(t => [t.id, t.title, t.text])).toEqual([['my-bbbbbbbb', 'After', 'New words here.']]);

    await card(page, 'After').getByRole('button', { name: 'Delete “After”' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('removed from your account');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete text' }).click();
    await expect(page.getByText('You have not added any text yet')).toBeVisible();
    expect(await server.textsOf(ME).list()).toEqual([]);
  });

  test('says so, and keeps the form as it was, when the server cannot be reached', async ({ page, server }) => {
    await openTexts(page);
    await signIn(page, ME);
    await page.getByRole('button', { name: 'Add a text' }).click();
    await field(page, 'Title').fill('Unlucky');
    await field(page, 'The text').fill('Words that must not be lost.');
    server.answerWith = 503;
    await page.getByRole('button', { name: 'Keep this text' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'could not be reached' })).toBeVisible();
    await expect(field(page, 'The text')).toHaveValue('Words that must not be lost.');
    expect(await storedInBrowser(page)).toBeNull(); // not quietly kept in the browser instead
    server.answerWith = null;
    await page.getByRole('button', { name: 'Keep this text' }).click();
    await expect(card(page, 'Unlucky')).toBeVisible();
  });

  test('says so, with a way to try again, when the texts cannot be read', async ({ page, server }) => {
    await server.textsOf(ME).create('my-cccccccc', { title: 'There', author: '', form: 'prose', text: 'Still there.' });
    await openTexts(page);
    await signIn(page, ME);
    await expect(card(page, 'There')).toBeVisible();
    server.answerWith = 503;
    await page.reload();
    await expect(page.getByRole('alert').filter({ hasText: 'could not be reached' })).toBeVisible();
    server.answerWith = null;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(card(page, 'There')).toBeVisible();
  });

  test('deleting the account deletes the texts too', async ({ page, server }) => {
    await server.textsOf(ME).create('my-dddddddd', { title: 'Mine', author: '', form: 'prose', text: 'Mine alone.' });
    await server.textsOf(YOU).create('my-eeeeeeee', { title: 'Theirs', author: '', form: 'prose', text: 'Theirs alone.' });
    await openTexts(page);
    await signIn(page, ME);
    await headerButton(page, 'Account').click();
    await page.getByRole('button', { name: 'Delete my account…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByRole('dialog', { name: 'Your account' }).getByRole('status')).toContainText('have been deleted');
    expect(await server.textsOf(ME).list()).toEqual([]);
    expect(await server.textsOf(YOU).list()).toHaveLength(1);
  });
});

test.describe('the texts of this browser, when the reader signs in', () => {
  test('are copied to the account once, with a notice, and kept here too', async ({ page, server }) => {
    await openTexts(page);
    await addPasted(page, 'Written before', longText('w'));
    await expect(card(page, 'Written before')).toBeVisible();
    const before = await storedInBrowser(page);
    const id = (JSON.parse(before!) as { texts: { id: string }[] }).texts[0].id;

    await signIn(page, ME);
    await expect(page.getByRole('status').filter({ hasText: '1 text from this browser was copied to your account.' })).toBeVisible();
    await expect(card(page, 'Written before')).toContainText('3 excerpts');
    expect((await server.textsOf(ME).list()).map(t => t.id)).toEqual([id]); // with the id it had, so poems made from it still open
    expect(await storedInBrowser(page)).toBe(before); // this browser's copy was left alone

    await page.reload();
    await expect(card(page, 'Written before')).toBeVisible();
    await expect(page.getByText('copied to your account')).toHaveCount(0); // said once
    expect(server.requests.filter(r => r.method === 'POST' && r.path === '/api/texts')).toHaveLength(1);
  });

  test('a text deleted from the account does not come back from this browser', async ({ page, server }) => {
    await openTexts(page);
    await addPasted(page, 'Gone for good', longText('g'));
    await signIn(page, ME);
    await expect(card(page, 'Gone for good')).toBeVisible();
    await card(page, 'Gone for good').getByRole('button', { name: 'Delete “Gone for good”' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete text' }).click();
    await expect(page.getByText('You have not added any text yet')).toBeVisible();
    await page.reload();
    await expect(page.getByText('You have not added any text yet')).toBeVisible();
    expect(await server.textsOf(ME).list()).toEqual([]);
  });

  test('are shown again, and only these, when the reader signs out', async ({ page }) => {
    await openTexts(page);
    await addPasted(page, 'In this browser', longText('b'));
    await signIn(page, ME);
    await addPasted(page, 'Only in the account', longText('a'));
    await expect(card(page, 'Only in the account')).toBeVisible();
    await headerButton(page, 'Account').click();
    await page.getByRole('dialog', { name: 'Your account' }).getByRole('button', { name: 'Sign out' }).click();
    await expect(card(page, 'In this browser')).toBeVisible();
    await expect(card(page, 'Only in the account')).toHaveCount(0);
    await expect(page.getByText('Kept in this browser only. Sign in, and they are kept in your account instead.')).toBeVisible();
  });
});

test.describe('the book picker', () => {
  test('lists the texts of the account among the books as soon as the reader has signed in', async ({ page, server }) => {
    await server.textsOf(ME).create('my-ffffffff', { title: 'A Letter Home', author: 'Me', form: 'prose', text: longText('l') });
    await page.goto('/discover');
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a book to begin' })).toBeVisible();
    await expect(page.getByText('A Letter Home')).toHaveCount(0);
    await signIn(page, ME);
    await expect(page.getByRole('button', { name: /A Letter Home/ })).toBeVisible();
  });
});
