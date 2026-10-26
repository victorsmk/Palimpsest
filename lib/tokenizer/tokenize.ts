import type { Token } from '@/lib/models';

/**
 * Normalizes quotes and apostrophes for dictionary lookup.
 * E.g. curly apostrophes ’ -> '
 */
function normalizeWord(raw: string): string {
  let w = raw.replace(/[’‘]/g, "'");
  // Strip leading and trailing punctuation (quotes, brackets, periods, commas, colons, etc.)
  // but keep internal hyphens and apostrophes (e.g. "don't", "honey-sweet")
  w = w.replace(/^[^a-zA-Z0-9']+/, '').replace(/[^a-zA-Z0-9']+$/, '');
  return w.toLowerCase();
}

/**
 * Tokenizes a literary passage preserving source text layout and attribution.
 * 
 * Rules:
 *  - Paragraphs are separated by double newlines (\n\n+).
 *  - The first token of any paragraph after paragraph 0 has lineBreakBefore = true.
 *  - Em dashes ('—') are emitted as separate non-selectable separator tokens.
 *  - Attached punctuation remains part of the display text of the word token.
 *  - Internal hyphens ('honey-sweet') and apostrophes ("don't") remain intact.
 *  - Stable token IDs: `${passageId}-token-${paddedPosition}`.
 *  - A line separator (U+2028) inside a paragraph marks a line of verse. It is whitespace like any other, so it
 *    changes no word and no id; the first token after it has lineStart = true, so that a page can show the line.
 *    (No prose text has one, so no prose token has `lineStart` at all.)
 */
export function tokenize(passageId: string, sourceText: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  // Split text into paragraphs
  const rawParagraphs = sourceText.split(/\r?\n\s*\r?\n+/);

  for (let pIdx = 0; pIdx < rawParagraphs.length; pIdx++) {
    const paragraphText = rawParagraphs[pIdx].trim();
    if (!paragraphText) continue;

    let isFirstInPara = true;

    // Lines of verse are separated by U+2028; every line after the first starts a line on the page.
    const lines = paragraphText.split('\u2028');
    let startsLine = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (lineIndex > 0) startsLine = true;
      // Split the line by em dash (—) while capturing the em dash
      const segments = line.split(/(—)/);

      for (const segment of segments) {
        if (segment === '—') {
          tokens.push({
            id: `${passageId}-token-${String(position).padStart(4, '0')}`,
            text: '—',
            word: '',
            position: position++,
            paragraphIndex: pIdx,
            lineBreakBefore: false,
            ...(startsLine ? { lineStart: true } : {}),
            kind: 'separator',
            isSelectable: false,
          });
          isFirstInPara = false;
          startsLine = false;
          continue;
        }

        // Split segment into whitespace-delimited words
        const rawWords = segment.split(/\s+/).filter(Boolean);

        for (const rawWord of rawWords) {
          const cleanWord = normalizeWord(rawWord);

          tokens.push({
            id: `${passageId}-token-${String(position).padStart(4, '0')}`,
            text: rawWord,
            word: cleanWord,
            position: position++,
            paragraphIndex: pIdx,
            lineBreakBefore: isFirstInPara && pIdx > 0,
            ...(startsLine ? { lineStart: true } : {}),
            kind: 'word',
            isSelectable: true,
          });

          isFirstInPara = false;
          startsLine = false;
        }
      }
    }
  }

  return tokens;
}
