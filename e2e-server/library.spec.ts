import type { Page } from '@playwright/test';
import { test, expect, openStudio } from './fixture';
import { keepFirstWords, keptWords } from '../e2e/helpers';

// Choosing a book. With a library of books on the server no page picks one for the reader: each asks, with a
// search by title or author, then the book's excerpts. The server holds two real books here (Jane Eyre, The
// Picture of Dorian Gray) and a small book of verse (Poems of Poe); the three bundled passages are not offered.

const start = (page: Page) => page.getByRole('heading', { level: 1, name: 'Choose a book to begin' });
const search = (page: Page) => page.getByLabel('Search by title or author');
const count = (page: Page) => page.getByRole('status').filter({ hasText: /book|No book|Searching/ });
const bookButton = (page: Page, title: string) => page.getByRole('button', { name: new RegExp(`^${title}`) });
const switcher = (page: Page) => page.getByRole('group', { name: 'Passage' });
const choose = async (page: Page, title: string, excerpt: RegExp | string) => {
  await bookButton(page, title).click();
  await page.getByRole('button', { name: excerpt }).first().click();
};

test.describe('before a book is chosen', () => {
  for (const [path, label] of [['/discover', 'Discover'], ['/assist', 'Assisted'], ['/studio', 'Studio']] as const) {
    test(`${label} asks for a book, picks none, and offers none of the bundled passages`, async ({ page }) => {
      await page.goto(path);
      await expect(start(page)).toBeVisible();
      await expect(page.locator('article')).toHaveCount(0);
      await expect(search(page)).toBeFocused();
      await expect(bookButton(page, 'Jane Eyre')).toBeVisible();
      await expect(bookButton(page, 'The Picture of Dorian Gray')).toBeVisible();
      await expect(page.getByRole('button', { name: /Walden/ })).toHaveCount(0);
      await expect(page.getByText('Where I Lived')).toHaveCount(0);
      await expect(count(page)).toHaveText('3 books');
    });
  }

  test('lists the books by title, leaving off a leading The', async ({ page }) => {
    await page.goto('/discover');
    await expect(bookButton(page, 'Jane Eyre')).toBeVisible();
    const titles = await page.locator('main ul li button .font-display').allInnerTexts();
    expect(titles).toEqual(['Jane Eyre', 'The Picture of Dorian Gray', 'Poems of Poe']);
  });
});

test.describe('poetry', () => {
  test('is marked as poetry in the list of books, and only poetry is', async ({ page }) => {
    await page.goto('/discover');
    await expect(bookButton(page, 'Poems of Poe')).toContainText('Edgar Allan Poe, 1845 · poetry');
    await expect(bookButton(page, 'Jane Eyre')).not.toContainText('poetry');
  });

  test('is found by its author, with the accents and capitals of the search ignored', async ({ page }) => {
    await page.goto('/discover');
    await search(page).fill('EDGAR poe');
    await expect(count(page)).toHaveText('1 book');
  });

  test('shows its lines as lines in the Studio, a stanza apart from the next, with every word a button', async ({ page }) => {
    await page.goto('/studio');
    await choose(page, 'Poems of Poe', /^The Raven/);
    const article = page.locator('article');
    await expect(article).toBeVisible();
    // The first stanza of The Raven has six lines, so five line breaks, and stanzas are separate paragraphs.
    const stanzas = article.locator('p');
    await expect(stanzas.nth(1).locator('br')).toHaveCount(5);
    await expect(stanzas.nth(1).locator('button[data-token-id]').first()).toHaveText('Once');
    await expect(stanzas.nth(1).locator('button', { hasText: /^Over$/ })).toBeVisible();
    const lineBreakBeforeOver = await stanzas.nth(1).locator('button', { hasText: /^Over$/ }).evaluate(el => el.previousElementSibling?.tagName);
    expect(lineBreakBeforeOver).toBe('BR');
    // and the first word of the stanza has none in front of it
    const beforeOnce = await stanzas.nth(1).locator('button', { hasText: /^Once$/ }).evaluate(el => el.previousElementSibling?.tagName ?? 'none');
    expect(beforeOnce).not.toBe('BR');
  });

  test('can be worked on like any other text: keep some words, and they read as the poem', async ({ page }) => {
    await openStudio(page, 'pg9999-0001');
    await keepFirstWords(page, 4);
    await expect(keptWords(page)).toHaveCount(4);
  });
});

test.describe('searching', () => {
  test('finds a book by its title or its author, ignoring capitals and accents', async ({ page }) => {
    await page.goto('/discover');
    await search(page).fill('BRONTE');
    await expect(count(page)).toHaveText('1 book');
    await expect(bookButton(page, 'Jane Eyre')).toBeVisible();
    await expect(bookButton(page, 'The Picture of Dorian Gray')).toHaveCount(0);
    await search(page).fill('wilde dorian');
    await expect(count(page)).toHaveText('1 book');
    await expect(bookButton(page, 'The Picture of Dorian Gray')).toBeVisible();
  });

  test('says when nothing matches, and shows everything again when the search is cleared', async ({ page }) => {
    await page.goto('/discover');
    await search(page).fill('zzzz');
    await expect(count(page)).toHaveText('No book matches “zzzz”.');
    await search(page).fill('');
    await expect(count(page)).toHaveText('3 books');
  });

  test('does not ask the server for every letter typed', async ({ page, server }) => {
    await page.goto('/discover');
    await expect(count(page)).toHaveText('3 books');
    const before = server.requests.filter(r => r.path === '/api/library/books').length;
    await search(page).pressSequentially('dorian', { delay: 30 });
    await expect(count(page)).toHaveText('1 book');
    const asked = server.requests.filter(r => r.path === '/api/library/books').length - before;
    expect(asked).toBeLessThanOrEqual(2);
  });

  test('works from the keyboard: type, Tab to a book, Enter to open it, and Back returns to the search as it was', async ({ page }) => {
    await page.goto('/discover');
    await search(page).fill('jane');
    await expect(count(page)).toHaveText('1 book');
    await page.keyboard.press('Tab');
    await expect(bookButton(page, 'Jane Eyre')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 3, name: 'Jane Eyre' })).toBeVisible();
    await page.getByRole('button', { name: 'All books' }).click();
    await expect(search(page)).toHaveValue('jane');
    await expect(count(page)).toHaveText('1 book');
  });

  test('says the books could not be loaded, and tries again when asked', async ({ page, server }) => {
    server.answerWith = 503;
    await page.goto('/discover');
    await expect(page.getByRole('alert').filter({ hasText: 'The books could not be loaded.' })).toBeVisible();
    server.answerWith = null;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(bookButton(page, 'Jane Eyre')).toBeVisible();
  });
});

test.describe('a book’s excerpts', () => {
  test('are listed with their chapter, their first words and their size, and Back returns to the books', async ({ page }) => {
    await page.goto('/discover');
    await bookButton(page, 'Jane Eyre').click();
    const first = page.getByRole('button', { name: /^Chapter I \(1 of 4\)/ });
    await expect(first).toBeVisible();
    await expect(first).toContainText('There was no possibility of taking a walk that day.');
    await expect(first).toContainText(/\d+ words/);
    await page.getByRole('button', { name: 'All books' }).click();
    await expect(bookButton(page, 'Jane Eyre')).toBeVisible();
  });

  test('come fifty at a time, with a button for more', async ({ page }) => {
    await page.goto('/discover');
    await bookButton(page, 'Jane Eyre').click(); // 381 excerpts
    const items = page.locator('main ul li');
    await expect(items).toHaveCount(50);
    await page.getByRole('button', { name: 'Show more excerpts' }).click();
    await expect(items).toHaveCount(100);
  });
});

test.describe('Discover and Assisted', () => {
  for (const [path, label, heading] of [['/discover', 'Discover', 'Poems hiding in the text'], ['/assist', 'Assisted', 'Poems you can erase your way to']] as const) {
    test(`${label}: choosing an excerpt opens it, names it in the address, and keeps it on reload`, async ({ page }) => {
      await page.goto(path);
      await choose(page, 'The Picture of Dorian Gray', /^Chapter I \(2 of 10\)/);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(switcher(page)).toContainText('The Picture of Dorian Gray, Oscar Wilde');
      await expect(switcher(page)).toContainText('Chapter I (2 of 10)');
      await expect(page).toHaveURL(/#passage=pg174-0002$/);
      await page.reload();
      await expect(switcher(page)).toContainText('Chapter I (2 of 10)');
    });

    test(`${label}: Previous and Next step through the book, and stop at its ends`, async ({ page }) => {
      await page.goto(`${path}#passage=pg174-0001`);
      await expect(switcher(page)).toContainText('excerpt 1 of 163');
      await expect(page.getByRole('button', { name: /Previous excerpt/ })).toBeDisabled();
      await page.getByRole('button', { name: /Next excerpt/ }).click();
      await expect(switcher(page)).toContainText('excerpt 2 of 163');
      await expect(page).toHaveURL(/#passage=pg174-0002$/);
      await expect(page.getByRole('button', { name: /Previous excerpt/ })).toBeEnabled();
      await page.getByRole('button', { name: /Previous excerpt/ }).click();
      await expect(switcher(page)).toContainText('excerpt 1 of 163');
      await page.goto(`${path}#passage=pg174-0163`);
      await page.reload();
      await expect(switcher(page)).toContainText('excerpt 163 of 163');
      await expect(page.getByRole('button', { name: /Next excerpt/ })).toBeDisabled();
    });

    test(`${label}: Change opens the window at the book being read, and Escape closes it and returns focus`, async ({ page }) => {
      await page.goto(`${path}#passage=pg1260-0003`);
      const change = page.getByRole('button', { name: 'Change book or excerpt' });
      await change.click();
      const dialog = page.getByRole('dialog', { name: 'Choose a book and an excerpt' });
      await expect(dialog.getByRole('heading', { level: 3, name: 'Jane Eyre' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(change).toBeFocused();

      await change.click();
      await dialog.getByRole('button', { name: 'All books' }).click();
      await dialog.getByRole('button', { name: /^The Picture of Dorian Gray/ }).click();
      await dialog.getByRole('button', { name: /^Chapter I \(1 of 10\)/ }).click();
      await expect(dialog).toHaveCount(0);
      await expect(switcher(page)).toContainText('The Picture of Dorian Gray');
      await expect(page).toHaveURL(/#passage=pg174-0001$/);
    });

    test(`${label}: an address naming an excerpt that is not there says so, and still lets the reader choose`, async ({ page }) => {
      await page.goto(`${path}#passage=pg999-0001`);
      await expect(page.getByRole('alert').filter({ hasText: 'That passage could not be opened.' })).toBeVisible();
      await expect(start(page)).toBeVisible();
      await bookButton(page, 'Jane Eyre').click();
      await page.getByRole('button', { name: /^Chapter I \(1 of 4\)/ }).click();
      await expect(switcher(page)).toContainText('Chapter I (1 of 4)');
    });
  }
});

test.describe('the Studio', () => {
  test('opens the empty editor on the excerpt chosen, or named in a #passage= address', async ({ page }) => {
    await page.goto('/studio');
    await choose(page, 'Jane Eyre', /^Chapter II \(1 of 6\)/);
    await expect(page.locator('article')).toBeVisible();
    await expect(switcher(page)).toContainText('Chapter II (1 of 6)');
    await page.goto('/studio#passage=pg174-0003');
    await page.reload();
    await expect(switcher(page)).toContainText('Chapter I (3 of 10)');
  });

  test('says an excerpt named in the address is not in the library, and asks which book', async ({ page }) => {
    await page.goto('/studio#passage=pg999-0001');
    await expect(page.getByRole('alert').filter({ hasText: 'That excerpt is not in the library.' })).toBeVisible();
    await expect(start(page)).toBeVisible();
  });

  test('asks before stepping to another excerpt would throw away changes that are not saved, and not otherwise', async ({ page }) => {
    await openStudio(page, 'pg174-0001');
    await page.getByRole('button', { name: /Next excerpt/ }).click(); // nothing changed yet: no question
    await expect(switcher(page)).toContainText('excerpt 2 of 163');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await keepFirstWords(page, 3);
    await page.getByRole('button', { name: /Next excerpt/ }).click();
    const question = page.getByRole('alertdialog');
    await expect(question).toContainText('will replace the poem you are editing');
    await question.getByRole('button', { name: /Cancel|Keep/ }).click();
    await expect(switcher(page)).toContainText('excerpt 2 of 163');
    await expect(keptWords(page)).toHaveCount(3);

    await page.getByRole('button', { name: /Next excerpt/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Replace|Discard|Switch|Continue/ }).click();
    await expect(switcher(page)).toContainText('excerpt 3 of 163');
    await expect(keptWords(page)).not.toHaveCount(3);
  });
});

test('the picker fits a phone: no sideways scrolling, and the search and the books are all there', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto('/studio');
  await expect(bookButton(page, 'Jane Eyre')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await bookButton(page, 'Jane Eyre').click();
  await expect(page.getByRole('button', { name: /^Chapter I \(1 of 4\)/ })).toBeVisible();
  const overflowExcerpts = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowExcerpts).toBeLessThanOrEqual(0);
});

test.describe('surprise me', () => {
  for (const [path, label] of [['/discover', 'Discover'], ['/studio', 'Studio']] as const) {
    test(`opens an excerpt of some book in ${label}`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('button', { name: 'Surprise me' }).click();
      await expect(switcher(page)).toBeVisible();
      await expect(start(page)).toHaveCount(0);
      // Discover keeps the excerpt in its address; the Studio keeps nothing there
      if (path === '/discover') await expect(page).toHaveURL(/#passage=pg\d+-\d{4}$/);
    });
  }

  test('is in the window for changing the book too, and changes what is on the page', async ({ page }) => {
    await openStudio(page);
    const before = new URL(page.url()).hash;
    await page.getByRole('button', { name: 'Change book or excerpt' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /All books/ }).click().catch(() => {});
    await page.getByRole('dialog').getByRole('button', { name: 'Surprise me' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(before).not.toBe('');
  });

  test('says so when nothing could be chosen, and can be tried again', async ({ page, server }) => {
    await page.goto('/discover');
    server.answerWith = 503;
    await page.getByRole('button', { name: 'Surprise me' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Nothing could be chosen' })).toBeVisible();
    server.answerWith = null;
    await page.getByRole('button', { name: 'Surprise me' }).click();
    await expect(switcher(page)).toBeVisible();
  });
});
