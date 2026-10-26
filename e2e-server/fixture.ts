import { test as base, expect, type Page } from '@playwright/test';
import { PostgresPoemRepository } from '@/lib/server/PostgresPoemRepository';
import { createPoemsApi } from '@/lib/server/api/handlers';
import { createAccountStore } from '@/lib/server/api/accounts';
import { testAuthenticator } from '@/lib/server/api/auth';
import { testUserId, TEST_CODE } from '@/lib/auth/testClient';
import { createTestDb } from '../tests/helpers/pgliteDb';
import { inProcessFetch } from '../tests/helpers/inProcessApi';
import { createLibraryApi } from '@/lib/server/api/library';
import { seedRealBooks } from '../tests/helpers/library';

export { expect, TEST_CODE, testUserId };

/** The excerpt the server tests open the Studio on: the first of Dorian Gray, in the server's library. */
export const START_EXCERPT = 'pg174-0001';

/**
 * Opens the Studio on an excerpt of the server's library. With a library of books the Studio does not choose
 * a book for the writer (it asks), so the tests name one in the address, as a link would.
 */
export async function openStudio(page: Page, excerpt = START_EXCERPT) {
  await page.goto(`/studio#passage=${excerpt}`);
  await expect(page.locator('article')).toBeVisible();
}

/** What a test can do to the server it is talking to. */
export interface FakeServer {
  /** One user's poems in the server's database. */
  poemsOf(email: string): PostgresPoemRepository;
  /** While set, every request to /api gets this status instead of an answer (503: down, 401: the sign-in has run out). */
  answerWith: number | null;
  /** While true, requests to /api fail as if the network were gone. */
  offline: boolean;
  /** How many requests reached /api. */
  requests: { method: string; path: string }[];
}

/**
 * The tests of the server backend stand in for the server: /api is answered, in this process, by the real
 * API handlers over a real SQL database (an in-process Postgres), with the made-up sign-in. A fresh
 * database for every test.
 */
export const test = base.extend<{ server: FakeServer }>({
  server: [async ({ context }, use) => {
    const db = await createTestDb();
    await seedRealBooks(db, 'dorianGray', 'janeEyre'); // a book in the server's library, besides the ones bundled with the app
    const api = createPoemsApi({
      authenticate: testAuthenticator(),
      poemsOf: userId => new PostgresPoemRepository(db, userId),
      accounts: createAccountStore({ db, noAuthUser: true }),
    });
    const handle = inProcessFetch(api, createLibraryApi({ db }));
    const server: FakeServer = {
      poemsOf: email => new PostgresPoemRepository(db, testUserId(email)),
      answerWith: null,
      offline: false,
      requests: [],
    };

    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      server.requests.push({ method: request.method(), path: url.pathname });
      if (server.offline) return route.abort('connectionfailed');
      if (server.answerWith !== null) {
        return route.fulfill({ status: server.answerWith, contentType: 'application/json', body: JSON.stringify({ error: { code: 'x', message: 'x' } }) });
      }
      const headers = request.headers();
      delete headers['content-length'];
      delete headers['host'];
      const body = request.postDataBuffer();
      const response = await handle(request.url(), { method: request.method(), headers, body: body ? body.toString('utf-8') : undefined });
      return route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });

    await use(server);
    await db.close();
  }, { auto: true }],
});

/** Signs in through the dialog, as a person would, with the made-up code. The dialog is open already. */
export async function completeSignIn(page: Page, email: string, code = TEST_CODE) {
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await dialog.getByLabel('Code from the email').fill(code);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

/** Opens the sign-in dialog from the page header and signs in. */
export async function signIn(page: Page, email: string) {
  await page.locator('header').getByRole('button', { name: 'Sign in', exact: true }).first().click();
  await completeSignIn(page, email);
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
}
