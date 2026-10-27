import { test, expect, type Page } from '@playwright/test';
import { keepFirstWords, keptWords, openCollection } from '../e2e/helpers';

/** The demo's library has books, and the Studio asks which to open; the tests name one in the address, as a link would. */
async function openStudio(page: Page) {
  await page.goto('/studio#passage=pg1260-0001');
  await expect(page.locator('article')).toBeVisible();
}

// The whole stack, with nothing standing in for the server: the demo's database, the Next route handlers,
// the made-up sign-in, and the screens.

const email = () => `person-${crypto.randomUUID().slice(0, 8)}@example.org`;
const header = (page: Page, name: 'Sign in' | 'Account') => page.locator('header').getByRole('button', { name, exact: true }).first();
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Sign in' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });

async function signIn(page: Page, address: string) {
  await header(page, 'Sign in').click();
  await expect(dialog(page)).toContainText('Demo: use any email address, and the code 123456.');
  await dialog(page).getByLabel('Email address').fill(address);
  await dialog(page).getByRole('button', { name: 'Send code' }).click();
  await dialog(page).getByLabel('Code from the email').fill('123456');
  await dialog(page).getByRole('button', { name: 'Sign in' }).click();
  await expect(header(page, 'Account')).toBeVisible();
}

async function save(page: Page, title: string) {
  await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
  const form = page.getByRole('dialog', { name: 'Save Poem Draft' });
  await form.getByLabel('Poem Title').fill(title);
  await form.getByLabel(/Notes/).fill('written in the demo');
  await form.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(page.getByText(`Draft "${title}" saved.`)).toBeVisible();
}

test('the server is up and set up for the demo', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true, settings: 'ok', database: 'ok', signIn: 'test sign-in (development only)', accountDeletion: 'ready', rateLimiting: 'ok', library: 'ok', texts: 'ok' });
});

test('the demo has a library of three real books, found by search and read over the real server, with no sign-in', async ({ request }) => {
  const all = await request.get('/api/library/books');
  expect(all.status()).toBe(200);
  expect(all.headers()['cache-control']).toContain('s-maxage');
  expect(((await all.json()) as { items: { title: string }[] }).items.map(b => b.title)).toEqual(['Jane Eyre', 'The Picture of Dorian Gray', 'Walden']);

  const found = await request.get('/api/library/books?search=BRONTE');
  expect(((await found.json()) as { items: { id: string }[] }).items.map(b => b.id)).toEqual(['pg1260']);

  const excerpts = await request.get('/api/library/books/pg1260/passages?limit=2');
  const page = (await excerpts.json()) as { items: { id: string; title: string }[]; next: string | null };
  expect(page.items.map(p => p.id)).toEqual(['pg1260-0001', 'pg1260-0002']);
  expect(page.next).toBe('2');

  const first = await request.get('/api/library/passages/pg1260-0001');
  expect(first.headers()['cache-control']).toContain('immutable');
  expect(((await first.json()) as { sourceText: string }).sourceText).toMatch(/^There was no possibility of taking a walk that day\./);
  expect((await request.get('/api/library/passages/pg1260-9999')).status()).toBe(404);
});

test('a poem saved while signed in is kept on the server: it is there after a reload, and for the same address in a fresh browser', async ({ page, browser }) => {
  const me = email();
  await openStudio(page);
  await keepFirstWords(page, 4);
  await page.getByRole('button', { name: 'Save Draft to Collection' }).click(); // signed out: asks first
  await expect(dialog(page)).toContainText('Sign in to save your poem.');
  await dialog(page).getByLabel('Email address').fill(me);
  await dialog(page).getByRole('button', { name: 'Send code' }).click();
  await dialog(page).getByLabel('Code from the email').fill('123456');
  await dialog(page).getByRole('button', { name: 'Sign in' }).click();
  const form = page.getByRole('dialog', { name: 'Save Poem Draft' });
  await expect(form).toContainText('Drafts are saved to your account.');
  await form.getByLabel('Poem Title').fill('Kept on the server');
  await form.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(page.getByText('Draft "Kept on the server" saved.')).toBeVisible();

  await page.reload();
  await openCollection(page);
  await expect(panel(page).getByRole('listitem')).toHaveCount(1);
  await expect(panel(page)).toContainText('Kept on the server');

  // Nothing of it is in this browser's own storage: it lives on the server.
  expect(await page.evaluate(() => window.localStorage.getItem('palimpsest:poems:v1'))).toBeNull();

  // A different browser (no shared storage at all), the same address: the same poem.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await openStudio(other);
  await signIn(other, me);
  await openCollection(other);
  await expect(panel(other).getByRole('listitem')).toHaveCount(1);
  await panel(other).getByRole('button', { name: /Kept on the server/ }).first().click();
  await expect(other.getByText('Editing: "Kept on the server"')).toBeVisible();
  await expect(keptWords(other)).toHaveCount(4);
  await fresh.close();
});

test('each address has its own poems', async ({ page }) => {
  const [a, b] = [email(), email()];
  await openStudio(page);
  await signIn(page, a);
  await keepFirstWords(page, 3);
  await save(page, 'Only A has this');
  await header(page, 'Account').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, b);
  await openCollection(page);
  await expect(panel(page)).toContainText('No drafts yet');
});

test('two tabs of the same account: the second to save is told the poem changed elsewhere', async ({ page }) => {
  await openStudio(page);
  await signIn(page, email());
  await keepFirstWords(page, 3);
  await save(page, 'Contested');

  const second = await page.context().newPage();
  await openStudio(second);
  await openCollection(second);
  await second.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('button', { name: /Contested/ }).first().click();
  await expect(second.getByText('Editing: "Contested"')).toBeVisible();

  await save(page, 'Changed first');
  await second.getByRole('button', { name: 'Save Draft to Collection' }).click();
  await second.getByRole('dialog', { name: 'Save Poem Draft' }).getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(second.getByRole('alertdialog', { name: 'This poem was changed somewhere else' })).toContainText('nothing there was overwritten');
});

test('deleting the account removes its poems, and the address starts empty again', async ({ page }) => {
  const me = email();
  await openStudio(page);
  await signIn(page, me);
  await keepFirstWords(page, 3);
  await save(page, 'Soon gone');

  await header(page, 'Account').click();
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByRole('dialog', { name: 'Your account' }).getByRole('status')).toContainText('have been deleted');
  await page.getByRole('dialog', { name: 'Your account' }).getByRole('button', { name: 'Close' }).last().click();

  await signIn(page, me);
  await openCollection(page);
  await expect(panel(page)).toContainText('No drafts yet');
});

test('signing in with the demo Google button keeps a poem on the server', async ({ page }) => {
  await openStudio(page);
  await keepFirstWords(page, 3);
  await header(page, 'Sign in').click();
  await dialog(page).getByRole('button', { name: 'Continue with Google (demo)' }).click();
  await expect(header(page, 'Account')).toBeVisible();
  await save(page, 'Google in the demo');
  await page.reload();
  await openCollection(page);
  await expect(panel(page)).toContainText('Google in the demo');
});
