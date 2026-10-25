import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const STORAGE_KEY = 'palimpsest:poems:v1';

/** Opens the Studio and waits for the library to finish loading. */
export async function openStudio(page: Page) {
  await page.goto('/studio');
  await expect(page.locator('article')).toBeVisible();
}

export const passageButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

/** The word buttons of the page text, in reading order. */
export const pageWords = (page: Page): Locator => page.locator('article button[data-token-id]');

export const keptWords = (page: Page): Locator =>
  page.locator('article button[data-token-id][aria-pressed="true"]');

export const styleButton = (page: Page, name: RegExp) =>
  page.getByRole('group', { name: 'Erasure Style' }).getByRole('button', { name });

export const viewToggle = (page: Page, name: 'In the page' | 'Extracted poem') =>
  page.getByRole('group', { name: 'Studio view' }).getByRole('button', { name, exact: true });

/** The kept words, as they read on the page. */
export async function keptText(page: Page): Promise<string> {
  return (await keptWords(page).allInnerTexts()).join(' ');
}

/** The extracted poem as lines of text, without the line-break markers. */
export async function poemLines(page: Page): Promise<string[]> {
  const text = await page.getByRole('group', { name: 'Poem text' }).innerText();
  return text
    .replace(/\s*↵/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Keeps only the first `count` words of the passage and erases everything else. */
export async function keepFirstWords(page: Page, count: number) {
  await page.getByRole('button', { name: 'Erase All' }).click();
  await expect(keptWords(page)).toHaveCount(0);
  for (let i = 0; i < count; i++) await pageWords(page).nth(i).click();
  await expect(keptWords(page)).toHaveCount(count);
}

export async function saveDraft(page: Page, title: string, notes = '') {
  await page.getByRole('button', { name: 'Save Draft to Collection' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Poem Draft' });
  await dialog.getByLabel('Poem Title').fill(title);
  await dialog.getByLabel(/Notes/).fill(notes);
  await dialog.getByRole('button', { name: 'Save Draft', exact: true }).click();
}

export async function openCollection(page: Page) {
  await page.getByRole('button', { name: 'My Collection' }).click();
  await expect(page.getByRole('dialog', { name: 'Saved Poems & Drafts' })).toBeVisible();
}

/** Plants drafts in localStorage before the app loads (only on the first load of a test). */
export async function seedDrafts(page: Page, drafts: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem(key, JSON.stringify(value));
        window.sessionStorage.setItem('__seeded', '1');
      }
    },
    { key: STORAGE_KEY, value: drafts }
  );
}

export function draft(overrides: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    lineBreaks: [],
    erasureStyle: 'blackout',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export interface PngFacts {
  width: number;
  height: number;
  /** Share of pixels that are near-black (ink bars). */
  dark: number;
  /** Share of pixels that are pure white (whiteout tape), as opposed to the cream paper. */
  white: number;
}

/** Reads a downloaded PNG: checks the signature, then measures it in the browser. */
export async function readPng(page: Page, download: Download): Promise<PngFacts> {
  const bytes = readFileSync(await download.path());
  expect([...bytes.subarray(0, 8)], 'PNG signature').toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

  return page.evaluate(async (base64: string) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    let white = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60) dark++;
      else if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) white++;
    }
    const pixels = canvas.width * canvas.height;
    return { width: canvas.width, height: canvas.height, dark: dark / pixels, white: white / pixels };
  }, bytes.toString('base64'));
}
