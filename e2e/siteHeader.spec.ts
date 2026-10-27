import { test, expect } from '@playwright/test';

const PAGES = [
  ['Discover', '/discover'],
  ['Assisted', '/assist'],
  ['Studio', '/studio'],
] as const;

for (const [name, path] of PAGES) {
  test.describe(`the header of ${name}`, () => {
    test('names the page you are on, without a link to it, and links to the other four', async ({ page }) => {
      await page.goto(path);
      const nav = page.getByRole('navigation', { name: 'Pages' });
      await expect(nav.locator('[aria-current="page"]')).toHaveText(name);
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
      await expect(nav.getByRole('link')).toHaveCount(4);
    });

    for (const width of [1280, 375]) {
      test(`runs the full width of the window, at ${width} pixels, with the page content inside it`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        const header = page.locator('header').first();
        const box = (await header.boundingBox())!;
        expect(box.x).toBe(0);
        expect(Math.round(box.width)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
      });
    }

    test('has the title as the one h1, and light text on its dark band with enough contrast', async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const ratio = await page.locator('header nav a').first().evaluate(el => {
        // Let the browser say what the colour is (it may have transparency), and put it over the band's dark.
        const canvas = document.createElement('canvas').getContext('2d')!;
        const rgba = (css: string) => {
          canvas.clearRect(0, 0, 1, 1);
          canvas.fillStyle = css;
          canvas.fillRect(0, 0, 1, 1);
          return canvas.getImageData(0, 0, 1, 1).data;
        };
        const band = [27, 23, 18];
        const [r, g, b, a] = rgba(getComputedStyle(el).color);
        const over = [r, g, b].map((v, i) => (v * a) / 255 + band[i] * (1 - a / 255));
        const lum = (rgb: number[]) => {
          const [lr, lg, lb] = rgb.map(v => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        };
        const fg = lum(over);
        const bg = lum(band);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    test('does not scroll sideways on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(scroll).toBeLessThanOrEqual(client);
    });
  });
}
