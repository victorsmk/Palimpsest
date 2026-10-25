// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toPng = vi.fn();
vi.mock('html-to-image', () => ({ toPng }));

import {
  EXPORT_IGNORE_ATTRIBUTE,
  exportElementAsPng,
  exportFilename,
  renderToPngDataUrl,
} from '@/lib/export/png';

describe('exportFilename', () => {
  it('builds a safe, descriptive file name', () => {
    expect(exportFilename('Walden — Where I Lived, and What I Lived For', 'page')).toBe(
      'palimpsest-walden-where-i-lived-and-what-i-lived-for-page.png'
    );
    expect(exportFilename('Winter Twilight', 'poem')).toBe('palimpsest-winter-twilight-poem.png');
  });

  it('strips accents, punctuation and path characters', () => {
    expect(exportFilename('Charlotte Brontë: "Jane" / Eyre?', 'poem')).toBe(
      'palimpsest-charlotte-bronte-jane-eyre-poem.png'
    );
    expect(exportFilename('../../etc/passwd', 'page')).not.toMatch(/[./\\]{2}|\/|\\/);
  });

  it('falls back when nothing usable is left, and caps the length', () => {
    expect(exportFilename('—?!—', 'poem')).toBe('palimpsest-untitled-poem.png');
    expect(exportFilename('a'.repeat(200), 'page').length).toBeLessThanOrEqual(
      'palimpsest-'.length + 60 + '-page.png'.length
    );
  });
});

describe('renderToPngDataUrl', () => {
  beforeEach(() => {
    toPng.mockReset();
    toPng.mockResolvedValue('data:image/png;base64,AAAA');
  });

  it('renders at twice the resolution on a paper-coloured background', async () => {
    const node = document.createElement('div');
    expect(await renderToPngDataUrl(node)).toBe('data:image/png;base64,AAAA');
    expect(toPng).toHaveBeenCalledWith(
      node,
      expect.objectContaining({ pixelRatio: 2, backgroundColor: '#F3EBDD' })
    );
  });

  it('leaves out elements marked as interface, but keeps the artwork and text nodes', async () => {
    const node = document.createElement('div');
    await renderToPngDataUrl(node);
    const { filter } = toPng.mock.calls[0][1] as { filter: (n: Node) => boolean };

    const hint = document.createElement('p');
    hint.setAttribute(EXPORT_IGNORE_ATTRIBUTE, '');
    expect(filter(hint)).toBe(false);
    expect(filter(document.createElement('p'))).toBe(true);
    expect(filter(document.createTextNode('word'))).toBe(true);
  });

  it('waits for web fonts before drawing', async () => {
    let fontsReady = false;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise<void>(r => setTimeout(() => { fontsReady = true; r(); }, 20)) },
    });
    toPng.mockImplementation(async () => {
      expect(fontsReady).toBe(true);
      return 'data:image/png;base64,AAAA';
    });
    await renderToPngDataUrl(document.createElement('div'));
    expect(toPng).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
  });

  it('finishes running transitions before the snapshot', async () => {
    const finish = vi.fn();
    const node = document.createElement('div');
    node.getAnimations = vi.fn(() => [{ finish }, { finish }] as unknown as Animation[]);
    toPng.mockImplementation(async () => {
      expect(finish).toHaveBeenCalledTimes(2);
      return 'data:image/png;base64,AAAA';
    });
    await renderToPngDataUrl(node);
    expect(node.getAnimations).toHaveBeenCalledWith({ subtree: true });
  });

  it('survives an animation that cannot be finished', async () => {
    const node = document.createElement('div');
    node.getAnimations = vi.fn(
      () =>
        [
          {
            finish: () => {
              throw new DOMException('infinite', 'InvalidStateError');
            },
          },
        ] as unknown as Animation[]
    );
    await expect(renderToPngDataUrl(node)).resolves.toBe('data:image/png;base64,AAAA');
  });
});

describe('exportElementAsPng', () => {
  let clicked: { href: string; download: string }[];
  const realClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    clicked = [];
    toPng.mockReset();
    toPng.mockResolvedValue('data:image/png;base64,AAAA');
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    };
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = realClick;
  });

  it('downloads the image under the given name and leaves no link behind', async () => {
    await exportElementAsPng(document.createElement('div'), 'palimpsest-x-page.png');
    expect(clicked).toEqual([
      { href: 'data:image/png;base64,AAAA', download: 'palimpsest-x-page.png' },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('downloads nothing when rendering fails, and reports the failure', async () => {
    toPng.mockRejectedValue(new Error('canvas too large'));
    await expect(exportElementAsPng(document.createElement('div'), 'x.png')).rejects.toThrow(
      'canvas too large'
    );
    expect(clicked).toEqual([]);
  });
});
