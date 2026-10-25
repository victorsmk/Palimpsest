/**
 * PNG export of a rendered DOM element (the book page or the extracted poem).
 * Browser-only: it reads the live DOM and triggers a file download.
 */

/** Elements carrying this attribute are interface, not artwork, and are left out of the image. */
export const EXPORT_IGNORE_ATTRIBUTE = 'data-export-ignore';

/** Matches the paper tone of the page frames so rounded corners are not transparent. */
const PAPER = '#F3EBDD';

export type ExportView = 'page' | 'poem';

export function exportFilename(title: string, view: ExportView, extension = 'png'): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `palimpsest-${slug || 'untitled'}-${view}.${extension}`;
}

/**
 * The snapshot copies computed styles, so a style change still easing in (the
 * erasure styles fade between looks) would be captured half-way. Jump any
 * running transition to its end state first.
 */
function settleTransitions(node: HTMLElement) {
  for (const animation of node.getAnimations?.({ subtree: true }) ?? []) {
    try {
      animation.finish();
    } catch {
      // An endless animation cannot be finished; it is not part of the artwork.
    }
  }
}

/** Renders the element to a PNG data URL at twice the screen resolution. */
export async function renderToPngDataUrl(node: HTMLElement): Promise<string> {
  // Draw only once the page's web fonts are ready, or the image falls back to a default serif.
  await document.fonts?.ready;
  settleTransitions(node);
  // Loaded on demand so the library is not part of the Studio's first load.
  const { toPng } = await import('html-to-image');
  return toPng(node, {
    pixelRatio: 2,
    backgroundColor: PAPER,
    filter: domNode => !(domNode instanceof HTMLElement && domNode.hasAttribute(EXPORT_IGNORE_ATTRIBUTE)),
  });
}

function download(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function exportElementAsPng(node: HTMLElement, filename: string): Promise<void> {
  download(await renderToPngDataUrl(node), filename);
}
