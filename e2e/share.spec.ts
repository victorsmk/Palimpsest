import { test, expect, type Page } from '@playwright/test';
import { keptText, keptWords, openStudio, pageWords, passageButton, poemLines, saveDraft, styleButton, viewToggle } from './helpers';

const WALDEN_1 = 'found=walden-woods:14-28:16,23'; // "the essential facts / of life, and see if I could / not learn what it had"
const WALDEN_1_LINES = ['the essential facts', 'of life, and see if I could', 'not learn what it had'];

const copyButton = (page: Page) => page.getByRole('group', { name: 'Export your poem' }).getByRole('button', { name: 'Copy link to this poem' });
const notice = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied: string[] }).copied);

/** A clipboard the page can write to and the test can read, the same in every browser. */
async function stubClipboard(page: Page, behaviour: 'works' | 'refuses' | 'missing' = 'works') {
  await page.addInitScript(mode => {
    (window as unknown as { copied: string[] }).copied = [];
    if (mode === 'missing') {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      return;
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (mode === 'refuses') throw new DOMException('denied', 'NotAllowedError');
          (window as unknown as { copied: string[] }).copied.push(text);
        },
      },
    });
  }, behaviour);
}

async function openWaldenPoem(page: Page) {
  await page.goto(`/studio#${WALDEN_1}`);
  await expect(keptWords(page)).toHaveCount(15);
}

test.describe('copying a link to a poem', () => {
  test('puts a link on the clipboard with the poem\'s words, breaks, style and title, and says so', async ({ page }) => {
    await stubClipboard(page);
    await openWaldenPoem(page);
    await saveDraft(page, 'Quiet Woods');
    await expect(page.getByText('Draft "Quiet Woods" saved.')).toBeVisible();

    await copyButton(page).click();
    await expect(notice(page, 'Link copied. Anyone with it can open this poem in the Studio.')).toBeVisible();
    const [link] = await copied(page);
    const origin = new URL(page.url()).origin;
    expect(link).toBe(`${origin}/studio#poem=walden-woods:14-28:16,23:b:Quiet%20Woods`);
  });

  test('carries the erasure style, and an empty title when the poem has none', async ({ page }) => {
    await stubClipboard(page);
    await openWaldenPoem(page);
    await styleButton(page, /Faded Ink/).click();
    await copyButton(page).click();
    await expect(notice(page, 'Link copied.')).toBeVisible();
    const [link] = await copied(page);
    expect(link).toMatch(/#poem=walden-woods:14-28:16,23:f:$/);
  });

  test('never carries the poem\'s notes', async ({ page }) => {
    await stubClipboard(page);
    await openWaldenPoem(page);
    await saveDraft(page, 'Quiet Woods', 'my private thoughts about this');
    await copyButton(page).click();
    await expect(notice(page, 'Link copied.')).toBeVisible();
    const [link] = await copied(page);
    expect(link).not.toContain('private');
    expect(decodeURIComponent(link)).not.toContain('thoughts');
  });

  test('can be pressed from the keyboard', async ({ page }) => {
    await stubClipboard(page);
    await openWaldenPoem(page);
    await copyButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(notice(page, 'Link copied.')).toBeVisible();
    expect(await copied(page)).toHaveLength(1);
  });

  test('is not available until a word is kept', async ({ page }) => {
    await stubClipboard(page);
    await openStudio(page);
    await page.getByRole('button', { name: 'Erase All' }).click();
    await expect(copyButton(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Restore All' }).click();
    await expect(copyButton(page)).toBeEnabled();
  });

  test('a poem of the whole passage is within the limit, since every bundled passage is', async ({ page }) => {
    await stubClipboard(page);
    await openStudio(page);
    await copyButton(page).click();
    await expect(notice(page, 'Link copied.')).toBeVisible();
    const [link] = await copied(page);
    expect(link).toMatch(/#poem=jane-eyre-ch1:[0-9,-]+::b:$/);
    expect(link.length).toBeLessThan(2000);
  });
});

test.describe('when the browser will not copy', () => {
  for (const behaviour of ['refuses', 'missing'] as const) {
    test(`shows the link to copy by hand (clipboard ${behaviour})`, async ({ page }) => {
      await stubClipboard(page, behaviour);
      await openWaldenPoem(page);
      await copyButton(page).click();

      const field = page.getByLabel(/Your browser would not copy the link for you/);
      await expect(field).toBeVisible();
      await expect(field).toBeFocused();
      const origin = new URL(page.url()).origin;
      await expect(field).toHaveValue(`${origin}/studio#poem=walden-woods:14-28:16,23:b:`);
      expect(await field.evaluate(el => (el as HTMLInputElement).selectionEnd! - (el as HTMLInputElement).selectionStart!)).toBe(
        (await field.inputValue()).length
      ); // all of it is selected
      await expect(notice(page, 'Link copied.')).toHaveCount(0); // it does not claim to have copied
    });
  }

  test('Done closes it, and changing the poem closes it too, since the link would be out of date', async ({ page }) => {
    await stubClipboard(page, 'refuses');
    await openWaldenPoem(page);
    const field = page.getByLabel(/Your browser would not copy the link for you/);

    await copyButton(page).click();
    await expect(field).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(field).toHaveCount(0);

    await copyButton(page).click();
    await expect(field).toBeVisible();
    await keptWords(page).first().click(); // erase a word
    await expect(field).toHaveCount(0);
  });
});

test.describe('opening a shared link', () => {
  test('opens the poem as it was shared: words, breaks, style and title', async ({ page, context }) => {
    await stubClipboard(page);
    await openWaldenPoem(page);
    await styleButton(page, /Whiteout/).click();
    await saveDraft(page, 'Quiet Woods');
    await copyButton(page).click();
    await expect(notice(page, 'Link copied.')).toBeVisible();
    const [link] = await copied(page);

    // Someone else, with a clean browser, opens the link.
    const reader = await context.newPage();
    await reader.goto(link);
    await expect(passageButton(reader, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    expect(await keptText(reader)).toBe('the essential facts of life, and see if I could not learn what it had');
    await expect(reader.getByText('Editing: "Quiet Woods"')).toBeVisible();
    await expect(styleButton(reader, /Whiteout/)).toHaveAttribute('aria-pressed', 'true');
    await viewToggle(reader, 'Extracted poem').click();
    expect(await poemLines(reader)).toEqual(WALDEN_1_LINES);
    await expect(notice(reader, 'Opened a poem shared with you, from Walden. Edit it, then save it to your collection.')).toBeVisible();
    expect(await reader.evaluate(() => window.location.hash)).toBe('');
  });

  test('a poem of scattered words, from the Assisted page, shares and opens the same', async ({ page, context }) => {
    await stubClipboard(page);
    await page.goto('/studio#assisted=walden-woods:53-55,57,61,63,64,68,69:57,64');
    await expect(keptWords(page)).toHaveCount(9);
    await copyButton(page).click();
    await expect(notice(page, 'Link copied.')).toBeVisible();
    const [link] = await copied(page);
    expect(link).toContain('#poem=walden-woods:53-55,57,61,63,64,68,69:57,64:b:');

    const reader = await context.newPage();
    await reader.goto(link);
    await expect(keptWords(reader)).toHaveCount(9);
    expect(await keptText(reader)).toBe('life, living is dear; wish practise resignation, quite necessary.');
    await viewToggle(reader, 'Extracted poem').click();
    expect(await poemLines(reader)).toEqual(['life, living is dear;', 'wish practise resignation,', 'quite necessary.']);
  });

  test('is not an unsaved change until you change it', async ({ page }) => {
    await page.goto('/studio#poem=walden-woods:14-28:16,23:b:Quiet%20Woods');
    await expect(keptWords(page)).toHaveCount(15);
    await passageButton(page, 'Jane Eyre').click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
  });

  test('over unsaved changes, it asks first', async ({ page }) => {
    await openStudio(page);
    await pageWords(page).first().click();
    await page.evaluate(() => { window.location.hash = '#poem=walden-woods:14-28:16,23:b:Quiet%20Woods'; });
    await expect(page.getByRole('alertdialog', { name: 'Discard your unsaved changes?' })).toContainText(
      "Opening this poem will replace the one you are editing, which has changes you haven't saved."
    );
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(passageButton(page, 'Walden')).toHaveAttribute('aria-pressed', 'true');
    await expect(keptWords(page)).toHaveCount(15);
  });

  test('shows a title as plain text and never runs it', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', d => { dialogs.push(d.type()); void d.dismiss(); });
    const hostile = '<img src=x onerror=alert(1)>';
    await page.goto(`/studio#poem=walden-woods:14-28:16,23:b:${encodeURIComponent(hostile)}`);
    await expect(keptWords(page)).toHaveCount(15);
    await expect(page.getByText(`Editing: "${hostile}"`)).toBeVisible();
    await expect(page.locator('header img')).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });
});

test.describe('links that will not open', () => {
  const cases: [string, string, RegExp][] = [
    ['gibberish', 'poem=garbage', /does not describe a poem the Studio can open/],
    ['words out of order', 'poem=walden-woods:5,3::b:', /does not describe a poem/],
    ['a style that does not exist', 'poem=walden-woods:3::x:', /does not describe a poem/],
    ['a title that is not valid', 'poem=walden-woods:3::b:%FF', /does not describe a poem/],
    ['too many words', 'poem=walden-woods:0-300::b:', /does not describe a poem/],
    ['a passage that is not in the library', 'poem=no-such-book:1,2::b:', /no longer in the library/],
    ['words that are not in the passage', 'poem=walden-woods:9000-9010::b:', /no longer matches the current text/],
  ];

  for (const [name, hash, message] of cases) {
    test(`refuses ${name} and leaves the Studio as it was`, async ({ page }) => {
      await page.goto(`/studio#${hash}`);
      await expect(page.locator('article')).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
      await expect(passageButton(page, 'Jane Eyre')).toHaveAttribute('aria-pressed', 'true');
      await expect(keptWords(page)).toHaveCount(237);
      expect(await page.evaluate(() => window.location.hash)).toBe('');
    });
  }
});

test('the button and the link field fit and can be touched on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubClipboard(page, 'refuses');
  await openWaldenPoem(page);
  const box = (await copyButton(page).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeGreaterThanOrEqual(24);
  await copyButton(page).click();
  await expect(page.getByLabel(/Your browser would not copy the link for you/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const done = (await page.getByRole('button', { name: 'Done' }).boundingBox())!;
  expect(done.height).toBeGreaterThanOrEqual(24);
});
