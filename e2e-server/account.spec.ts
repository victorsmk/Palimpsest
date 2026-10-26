import type { Page } from '@playwright/test';
import { test, expect, completeSignIn, signIn, testUserId, TEST_CODE } from './fixture';
import { STORAGE_KEY, draft, keepFirstWords, keptWords, openCollection, openStudio, seedDrafts } from '../e2e/helpers';

// The app with its poems on the server: signing in with a code, saving needing an account, the
// collection following the account, bringing the poems of this browser across, and deleting the account.

const ME = 'me@example.org';
const YOU = 'you@example.org';

const signInDialog = (page: Page) => page.getByRole('dialog', { name: 'Sign in' });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Saved Poems & Drafts' });
const saveForm = (page: Page) => page.getByRole('dialog', { name: 'Save Poem Draft' });
// In the page header: the sign-in dialog has a button of the same name.
const headerButton = (page: Page, name: 'Sign in' | 'Account') => page.locator('header').getByRole('button', { name, exact: true }).first();

async function saveOne(page: Page, title: string) {
  await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
  await saveForm(page).getByLabel('Poem Title').fill(title);
  await saveForm(page).getByRole('button', { name: 'Save Draft', exact: true }).click();
}

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `walden-woods-token-${String(from + i).padStart(4, '0')}`);
const localPoem = (id: string, title: string) => draft({ id, passageId: 'walden-woods', title, notes: `notes of ${title}`, retainedTokenIds: ids(14, 20), lineBreaks: [] });

test.describe('a visitor', () => {
  test('is offered "Sign in" on every page, and nothing about an account', async ({ page }) => {
    for (const path of ['/', '/discover', '/assist', '/studio']) {
      await page.goto(path);
      await expect(headerButton(page, 'Sign in')).toBeVisible();
      await expect(headerButton(page, 'Account')).toHaveCount(0);
    }
  });

  test('can still use the Studio, Discover and Assisted without signing in', async ({ page, server }) => {
    await openStudio(page);
    await keepFirstWords(page, 3);
    await expect(keptWords(page)).toHaveCount(3);
    await page.goto('/discover');
    await expect(page.getByRole('group', { name: 'Passage' })).toBeVisible();
    expect(server.requests).toEqual([]); // nothing was asked of the server
  });
});

test.describe('signing in with a code', () => {
  test('asks for an address, sends a code, and signs in with it; the session survives a reload', async ({ page }) => {
    await openStudio(page);
    await headerButton(page, 'Sign in').click();
    await expect(signInDialog(page)).toBeVisible();
    await signInDialog(page).getByLabel('Email address').fill(ME);
    await signInDialog(page).getByRole('button', { name: 'Send code' }).click();
    await expect(signInDialog(page).getByRole('status')).toContainText(`We sent a code to ${ME}.`);
    await signInDialog(page).getByLabel('Code from the email').fill(` ${TEST_CODE.slice(0, 3)} ${TEST_CODE.slice(3)} `);
    await signInDialog(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(signInDialog(page)).toHaveCount(0);
    await expect(headerButton(page, 'Account')).toBeVisible();

    await page.reload();
    await expect(headerButton(page, 'Account')).toBeVisible();
  });

  test('says what is wrong with an address, and with a code, and lets it be tried again', async ({ page }) => {
    await openStudio(page);
    await headerButton(page, 'Sign in').click();
    await signInDialog(page).getByLabel('Email address').fill('not an address');
    await signInDialog(page).getByRole('button', { name: 'Send code' }).click();
    await expect(signInDialog(page).getByRole('alert')).toHaveText('Enter an email address like name@example.com.');

    await signInDialog(page).getByLabel('Email address').fill(ME);
    await signInDialog(page).getByRole('button', { name: 'Send code' }).click();
    await signInDialog(page).getByLabel('Code from the email').fill('000000');
    await signInDialog(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(signInDialog(page).getByRole('alert')).toContainText('That code is not right');
    await expect(headerButton(page, 'Sign in')).toBeVisible();

    await signInDialog(page).getByLabel('Code from the email').fill('12ab');
    await signInDialog(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(signInDialog(page).getByRole('alert')).toContainText('That code is not right');

    await signInDialog(page).getByLabel('Code from the email').fill(TEST_CODE);
    await signInDialog(page).getByRole('button', { name: 'Sign in' }).click();
    await expect(headerButton(page, 'Account')).toBeVisible();
  });

  test('can go back to change the address, and Escape closes the dialog', async ({ page }) => {
    await openStudio(page);
    await headerButton(page, 'Sign in').click();
    await signInDialog(page).getByLabel('Email address').fill(ME);
    await signInDialog(page).getByRole('button', { name: 'Send code' }).click();
    await signInDialog(page).getByRole('button', { name: 'Use another address' }).click();
    await expect(signInDialog(page).getByLabel('Email address')).toHaveValue(ME);
    await page.keyboard.press('Escape');
    await expect(signInDialog(page)).toHaveCount(0);
    await expect(headerButton(page, 'Sign in')).toBeFocused();
  });

  test('can sign out from the account dialog', async ({ page }) => {
    await openStudio(page);
    await signIn(page, ME);
    await headerButton(page, 'Account').click();
    await expect(page.getByRole('dialog', { name: 'Your account' })).toContainText(ME);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(headerButton(page, 'Sign in')).toBeVisible();
    await page.reload();
    await expect(headerButton(page, 'Sign in')).toBeVisible();
  });
});

test.describe('signing in with Google (the demo stand-in for its button)', () => {
  const googleButton = (page: Page) => signInDialog(page).getByRole('button', { name: 'Continue with Google (demo)' });
  const GOOGLE = 'google-demo@example.com';

  test('is offered above the email form, and signs in without leaving the page', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 3);
    await headerButton(page, 'Sign in').click();
    await expect(googleButton(page)).toBeVisible();
    await expect(signInDialog(page).getByLabel('Email address')).toBeVisible();
    await googleButton(page).click();
    await expect(signInDialog(page)).toHaveCount(0);
    await expect(headerButton(page, 'Account')).toBeVisible();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(keptWords(page)).toHaveCount(3); // the poem on the page is as it was
    await headerButton(page, 'Account').click();
    await expect(page.getByRole('dialog', { name: 'Your account' })).toContainText(GOOGLE);
  });

  test('saving while signed out can be finished with Google, and opens the save form after', async ({ page, server }) => {
    await openStudio(page);
    await keepFirstWords(page, 4);
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await googleButton(page).click();
    await expect(saveForm(page)).toBeVisible();
    await saveForm(page).getByLabel('Poem Title').fill('Through Google');
    await saveForm(page).getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.getByText('Draft "Through Google" saved.')).toBeVisible();
    expect(await server.poemsOf(GOOGLE).count()).toBe(1);
  });

  test('the same address by email code is the same account, with the same poems', async ({ page }) => {
    await openStudio(page);
    await headerButton(page, 'Sign in').click();
    await googleButton(page).click();
    await keepFirstWords(page, 3);
    await saveOne(page, 'Saved by the Google sign-in');
    await expect(page.getByText('Draft "Saved by the Google sign-in" saved.')).toBeVisible();

    await headerButton(page, 'Account').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await headerButton(page, 'Sign in').click();
    await completeSignIn(page, GOOGLE);
    await openCollection(page);
    await expect(panel(page).getByRole('listitem')).toHaveCount(1);
    await expect(panel(page)).toContainText('Saved by the Google sign-in');
  });

  test('is not offered once the email code has been asked for, and comes back with "Use another address"', async ({ page }) => {
    await openStudio(page);
    await headerButton(page, 'Sign in').click();
    await expect(googleButton(page)).toBeVisible();
    await signInDialog(page).getByLabel('Email address').fill(ME);
    await signInDialog(page).getByRole('button', { name: 'Send code' }).click();
    await expect(googleButton(page)).toHaveCount(0);
    await signInDialog(page).getByRole('button', { name: 'Use another address' }).click();
    await expect(googleButton(page)).toBeVisible();
  });
});

test.describe('saving a poem', () => {
  test('needs an account: the sign-in comes first, the poem stays, and the save form opens after', async ({ page, server }) => {
    await openStudio(page);
    await keepFirstWords(page, 4);
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await expect(signInDialog(page)).toBeVisible();
    await expect(signInDialog(page)).toContainText('Sign in to save your poem. What is on the page stays just as it is.');
    await expect(saveForm(page)).toHaveCount(0);

    await completeSignIn(page, ME);
    await expect(saveForm(page)).toBeVisible();
    await expect(saveForm(page)).toContainText('Drafts are saved to your account.');
    await expect(saveForm(page)).not.toContainText('browser storage');
    await expect(keptWords(page)).toHaveCount(4);

    await saveForm(page).getByLabel('Poem Title').fill('Kept by me');
    await saveForm(page).getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.getByText('Draft "Kept by me" saved.')).toBeVisible();

    const mine = (await server.poemsOf(ME).list()).items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'Kept by me', revision: 1 });
    expect(mine[0].retainedTokenIds).toHaveLength(4);
    expect(await server.poemsOf(YOU).count()).toBe(0);
  });

  test('goes straight to the save form when already signed in, and saves again as the next revision', async ({ page, server }) => {
    await openStudio(page);
    await signIn(page, ME);
    await keepFirstWords(page, 3);
    await saveOne(page, 'First');
    await expect(page.getByText('Draft "First" saved.')).toBeVisible();
    await saveOne(page, 'First again');
    await expect(page.getByText('Draft "First again" saved.')).toBeVisible();
    const [stored] = (await server.poemsOf(ME).list()).items;
    expect(stored).toMatchObject({ title: 'First again', revision: 2 });
    expect(await server.poemsOf(ME).count()).toBe(1);
  });

  test('tells a visitor with the poem in hand nothing about browser storage', async ({ page }) => {
    await openStudio(page);
    await keepFirstWords(page, 2);
    await signIn(page, ME);
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await expect(saveForm(page)).not.toContainText('browser storage');
  });
});

test.describe('My Collection', () => {
  test('asks a visitor to sign in, and shows the poems once they have', async ({ page, server }) => {
    await server.poemsOf(ME).create({ passageId: 'walden-woods', title: 'Waiting for me', notes: '', retainedTokenIds: ids(14, 20), lineBreaks: [], erasureStyle: 'blackout' });
    await openStudio(page);
    await openCollection(page);
    await expect(panel(page)).toContainText('Sign in to see your collection');
    await expect(panel(page).getByRole('button', { name: 'Download my poems as text' })).toBeHidden();

    await panel(page).getByRole('button', { name: 'Sign in' }).click();
    await completeSignIn(page, ME);
    await expect(panel(page).getByRole('listitem')).toHaveCount(1);
    await expect(panel(page).getByRole('listitem')).toContainText('Waiting for me');
    await expect(panel(page).getByRole('listitem')).toContainText('From Walden');
    await expect(panel(page).getByRole('button', { name: 'Download my poems as text' })).toBeVisible();
  });

  test('is each account’s own: another address sees none of it, and signing back in brings it back', async ({ page }) => {
    await openStudio(page);
    await signIn(page, ME);
    await keepFirstWords(page, 3);
    await saveOne(page, 'Only mine');
    await expect(page.getByText('Draft "Only mine" saved.')).toBeVisible();

    await headerButton(page, 'Account').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, YOU);
    await openCollection(page);
    await expect(panel(page)).toContainText('No drafts yet');
    await panel(page).getByRole('button', { name: 'Close Collection', exact: true }).click();

    await headerButton(page, 'Account').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, ME);
    await openCollection(page);
    await expect(panel(page).getByRole('listitem')).toHaveCount(1);
    await expect(panel(page)).toContainText('Only mine');
  });

  test('opens a poem whole, with its notes, and renaming and deleting reach the server', async ({ page, server }) => {
    const made = await server.poemsOf(ME).create({ passageId: 'walden-woods', title: 'Pond', notes: 'by the water', retainedTokenIds: ids(14, 24), lineBreaks: [ids(14, 24)[3]], erasureStyle: 'faded' });
    await openStudio(page);
    await signIn(page, ME);
    await openCollection(page);
    await panel(page).getByRole('button', { name: 'Rename draft Pond' }).click();
    await panel(page).getByLabel('New title for “Pond”').fill('Pond at dusk');
    await page.keyboard.press('Enter');
    await expect(panel(page).getByRole('status').filter({ hasText: 'Renamed to “Pond at dusk”.' })).toBeVisible();
    expect(await server.poemsOf(ME).get(made.id)).toMatchObject({ title: 'Pond at dusk', revision: 2 });

    await panel(page).getByRole('button', { name: /Pond at dusk/ }).first().click();
    await expect(page.getByText('Editing: "Pond at dusk"')).toBeVisible();
    await expect(keptWords(page)).toHaveCount(11);
    await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await expect(saveForm(page).getByLabel(/Notes/)).toHaveValue('by the water');
    await saveForm(page).getByRole('button', { name: 'Cancel' }).click();

    await openCollection(page);
    await page.getByRole('button', { name: 'Delete draft Pond at dusk' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poem' }).click();
    await expect.poll(() => server.poemsOf(ME).count()).toBe(0);
  });

  test('a link to a saved poem asks a visitor to sign in, and opens it for the account that has it', async ({ page, server }) => {
    const made = await server.poemsOf(ME).create({ passageId: 'walden-woods', title: 'Linked', notes: '', retainedTokenIds: ids(14, 20), lineBreaks: [], erasureStyle: 'blackout' });
    await page.goto(`/studio#open=${made.id}`);
    await expect(page.getByRole('alert').filter({ hasText: 'Sign in to open your saved poems.' })).toBeVisible();
    await signIn(page, ME);
    await page.goto(`/studio#open=${made.id}`);
    await expect(page.getByText('Editing: "Linked"')).toBeVisible();
  });

  test('can be downloaded as readable text, and has no file of codes to back up or restore', async ({ page, server }) => {
    await server.poemsOf(ME).create({ passageId: 'walden-woods', title: 'Backed up', notes: 'my note', retainedTokenIds: ids(14, 20), lineBreaks: [ids(14, 20)[2]], erasureStyle: 'blackout' });
    await openStudio(page);
    await signIn(page, ME);
    await openCollection(page);
    // The account keeps the poems, so the JSON backup and restore are not offered.
    await expect(panel(page).getByRole('button', { name: /copy of all my poems|from a downloaded copy/ })).toHaveCount(0);
    await expect(panel(page).locator('input[type="file"]')).toHaveCount(0);

    const download = page.waitForEvent('download');
    await panel(page).getByRole('button', { name: 'Download my poems as text' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^palimpsest-poems-\d{4}-\d{2}-\d{2}\.txt$/);
    const text = await (await import('node:fs')).promises.readFile((await file.path())!, 'utf-8');
    expect(text).toContain('My poems from Palimpsest');
    expect(text).toContain('Backed up');
    expect(text).toContain('Found in ');
    expect(text).toContain('my note');
    await expect(panel(page).getByRole('status')).toHaveText(`Downloaded 1 poem to ${file.suggestedFilename()}.`);
  });
});

test.describe('when the server or the sign-in lets the writer down', () => {
  test('a server that is down: saving says so, keeps the form and the poem, and works when it is back', async ({ page, server }) => {
    await openStudio(page);
    await signIn(page, ME);
    await keepFirstWords(page, 3);
    server.answerWith = 503;
    await saveOne(page, 'Will wait');
    await expect(saveForm(page).getByRole('alert')).toHaveText('The server could not be reached. Please try again.');
    await expect(saveForm(page).getByLabel('Poem Title')).toHaveValue('Will wait');
    await expect(keptWords(page)).toHaveCount(3);

    server.answerWith = null;
    await saveForm(page).getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.getByText('Draft "Will wait" saved.')).toBeVisible();
    expect(await server.poemsOf(ME).count()).toBe(1);
  });

  test('no connection: the collection says it could not be read, and saving asks to try again', async ({ page, server }) => {
    await openStudio(page);
    await signIn(page, ME);
    await keepFirstWords(page, 3);
    server.offline = true;
    await openCollection(page);
    await expect(panel(page).getByRole('alert')).toHaveText('The server could not be reached. Please try again.');
    await panel(page).getByRole('button', { name: 'Close Collection', exact: true }).click();
    await saveOne(page, 'Offline');
    await expect(saveForm(page).getByRole('alert')).toContainText('Please try again');
  });

  test('a sign-in that has run out: saving says to sign in, and the poem is not lost', async ({ page, server }) => {
    await openStudio(page);
    await signIn(page, ME);
    await keepFirstWords(page, 3);
    server.answerWith = 401;
    await saveOne(page, 'Needs a new sign-in');
    await expect(saveForm(page).getByRole('alert')).toHaveText('You need to sign in to do this.');
    await expect(keptWords(page)).toHaveCount(3);
  });

  test('two tabs of the same account: the second to save is told the poem changed elsewhere', async ({ page, server }) => {
    await openStudio(page);
    await signIn(page, ME);
    await keepFirstWords(page, 3);
    await saveOne(page, 'Shared');
    await expect(page.getByText('Draft "Shared" saved.')).toBeVisible();

    const second = await page.context().newPage();
    await openStudio(second);
    await openCollection(second);
    await second.getByRole('dialog', { name: 'Saved Poems & Drafts' }).getByRole('button', { name: /Shared/ }).first().click();
    await expect(second.getByText('Editing: "Shared"')).toBeVisible();

    await saveOne(page, 'Changed in the first');
    await expect(page.getByText('Draft "Changed in the first" saved.')).toBeVisible();

    await second.getByRole('button', { name: 'Save Draft to Collection' }).click();
    await second.getByRole('dialog', { name: 'Save Poem Draft' }).getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(second.getByRole('alertdialog', { name: 'This poem was changed somewhere else' })).toContainText('nothing there was overwritten');
    expect((await server.poemsOf(ME).list()).items[0]).toMatchObject({ title: 'Changed in the first', revision: 2 });
  });
});

test.describe('the poems kept in this browser', () => {
  const seed = (page: Page) => seedDrafts(page, { a: localPoem('a', 'Old Pond'), b: localPoem('b', 'Quiet Woods') });
  const offer = (page: Page) => page.getByRole('dialog', { name: 'Add your poems to your account?' });
  const localCount = (page: Page) => page.evaluate(key => Object.keys(JSON.parse(window.localStorage.getItem(key) ?? '{}')).length, STORAGE_KEY);

  test('are offered to a new sign-in, and added when the writer says so, leaving the copies here', async ({ page, server }) => {
    await seed(page);
    await openStudio(page);
    await signIn(page, ME);
    await expect(offer(page)).toBeVisible();
    await expect(offer(page)).toContainText('There are 2 poems saved in this browser.');
    await offer(page).getByRole('button', { name: 'Add 2 poems' }).click();
    await expect(offer(page).getByRole('status')).toContainText('Added 2 poems to your account.');
    await expect(offer(page).getByRole('status')).toContainText('The poems in this browser have not been changed.');
    await offer(page).getByRole('button', { name: 'Close' }).click();

    expect(await server.poemsOf(ME).count()).toBe(2);
    expect((await server.poemsOf(ME).get('a'))?.notes).toBe('notes of Old Pond');
    expect(await localCount(page)).toBe(2);
    await openCollection(page);
    await expect(panel(page).getByRole('listitem')).toHaveCount(2);

    await page.reload();
    await expect(headerButton(page, 'Account')).toBeVisible();
    await expect(offer(page)).toHaveCount(0); // answered: not asked again
  });

  test('"Not now" is an answer: nothing is added, it is not asked again, and the account dialog still offers it', async ({ page, server }) => {
    await seed(page);
    await openStudio(page);
    await signIn(page, ME);
    await offer(page).getByRole('button', { name: 'Not now' }).click();
    expect(await server.poemsOf(ME).count()).toBe(0);

    await page.reload();
    await expect(headerButton(page, 'Account')).toBeVisible();
    await expect(offer(page)).toHaveCount(0);

    await headerButton(page, 'Account').click();
    await page.getByRole('button', { name: 'Add the 2 poems saved in this browser…' }).click();
    await offer(page).getByRole('button', { name: 'Add 2 poems' }).click();
    await expect(offer(page).getByRole('status')).toContainText('Added 2 poems to your account.');
    expect(await server.poemsOf(ME).count()).toBe(2);
  });

  test('adding them a second time adds nothing twice', async ({ page, server }) => {
    await seed(page);
    await openStudio(page);
    await signIn(page, ME);
    await offer(page).getByRole('button', { name: 'Add 2 poems' }).click();
    await expect(offer(page).getByRole('status')).toContainText('Added 2 poems');
    await offer(page).getByRole('button', { name: 'Close' }).click();

    await headerButton(page, 'Account').click();
    await page.getByRole('button', { name: 'Add the 2 poems saved in this browser…' }).click();
    await offer(page).getByRole('button', { name: 'Add 2 poems' }).click();
    await expect(offer(page).getByRole('status')).toContainText('Added 0 poems to your account. 2 poems were already there.');
    expect(await server.poemsOf(ME).count()).toBe(2);
  });

  test('a failure leaves the offer open to try again, and adds nothing', async ({ page, server }) => {
    await seed(page);
    await openStudio(page);
    await signIn(page, ME);
    server.answerWith = 503;
    await offer(page).getByRole('button', { name: 'Add 2 poems' }).click();
    await expect(offer(page).getByRole('alert')).toHaveText('The server could not be reached. Please try again.');
    server.answerWith = null;
    await offer(page).getByRole('button', { name: 'Add 2 poems' }).click();
    await expect(offer(page).getByRole('status')).toContainText('Added 2 poems');
  });

  test('are not mentioned to someone who has none', async ({ page }) => {
    await openStudio(page);
    await signIn(page, ME);
    await expect(offer(page)).toHaveCount(0);
    await headerButton(page, 'Account').click();
    await expect(page.getByRole('button', { name: /saved in this browser/ })).toHaveCount(0);
  });
});

test.describe('deleting the account', () => {
  async function openDeleteQuestion(page: Page) {
    await headerButton(page, 'Account').click();
    await page.getByRole('button', { name: 'Delete my account…' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Delete your account?' })).toBeVisible();
  }

  test('asks first, and cancelling changes nothing', async ({ page, server }) => {
    await server.poemsOf(ME).create({ passageId: 'walden-woods', title: 'Mine', notes: '', retainedTokenIds: ids(14, 20), lineBreaks: [], erasureStyle: 'blackout' });
    await openStudio(page);
    await signIn(page, ME);
    await openDeleteQuestion(page);
    await expect(page.getByRole('alertdialog')).toContainText('permanently deletes your account and every poem saved in it');
    await expect(page.getByRole('alertdialog')).toContainText("Poems saved in this browser's own storage are not touched.");
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    expect(await server.poemsOf(ME).count()).toBe(1);
    await expect(page.getByRole('dialog', { name: 'Your account' })).toBeVisible();
  });

  test('deletes the poems of the account and nobody else’s, and signs out', async ({ page, server }) => {
    for (const email of [ME, YOU]) {
      await server.poemsOf(email).create({ passageId: 'walden-woods', title: `Of ${email}`, notes: '', retainedTokenIds: ids(14, 20), lineBreaks: [], erasureStyle: 'blackout' });
    }
    await openStudio(page);
    await signIn(page, ME);
    await openDeleteQuestion(page);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByRole('dialog', { name: 'Your account' }).getByRole('status')).toHaveText('Your account and every poem saved in it have been deleted. You are signed out.');
    expect(await server.poemsOf(ME).count()).toBe(0);
    expect(await server.poemsOf(YOU).count()).toBe(1);

    await page.getByRole('dialog', { name: 'Your account' }).getByRole('button', { name: 'Close' }).last().click();
    await expect(headerButton(page, 'Sign in')).toBeVisible();
    expect(testUserId(ME)).not.toBe(testUserId(YOU));
  });

  test('says so, and stays signed in, if the server cannot do it', async ({ page, server }) => {
    await server.poemsOf(ME).create({ passageId: 'walden-woods', title: 'Mine', notes: '', retainedTokenIds: ids(14, 20), lineBreaks: [], erasureStyle: 'blackout' });
    await openStudio(page);
    await signIn(page, ME);
    await openDeleteQuestion(page);
    server.answerWith = 503;
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByRole('alertdialog').getByRole('alert')).toHaveText('The server could not be reached. Please try again.');
    server.answerWith = null;
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByRole('dialog', { name: 'Your account' }).getByRole('status')).toContainText('have been deleted');
    expect(await server.poemsOf(ME).count()).toBe(0);
  });
});
