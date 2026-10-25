/**
 * Text exports of a finished poem: plain text and Markdown. The poem is the retained words in
 * source order, broken into lines where the writer asked for a break. Line breaks never reorder words.
 */
import type { Attribution, Token } from '@/lib/models';

export interface PoemDocument {
  title: string;
  /** The poem, one string per line. */
  lines: string[];
  attribution: Attribution;
  /** The writer's own notes. Only the Markdown file carries them. */
  notes?: string;
}

const UNTITLED = 'Untitled poem';

/** Puts the retained words into lines: a line ends after every word in `lineBreakSet`. */
export function poemLines(tokens: readonly Token[], lineBreakSet: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  for (const token of tokens) {
    current.push(token.text);
    if (lineBreakSet.has(token.id)) {
      lines.push(current.join(' '));
      current = [];
    }
  }
  if (current.length > 0) lines.push(current.join(' '));
  return lines;
}

/** One line, however the title was typed. */
const cleanTitle = (title: string) => title.replace(/\s+/g, ' ').trim() || UNTITLED;

const sourceLine = ({ title, author, year }: Attribution) => `Found in ${title}, ${author} (${year})`;

/** Plain text: the title, the poem, and where it was found. */
export function poemToText({ title, lines, attribution }: PoemDocument): string {
  return [cleanTitle(title), '', ...lines, '', `${sourceLine(attribution)}`, `Source: ${attribution.source}, ${attribution.url}`, ''].join('\n');
}

/**
 * Makes text read literally in Markdown: characters that mean something are escaped, and so is a
 * line that would otherwise start a numbered list ("1." as a word).
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_[\]<>#~|&]/g, '\\$&')
    .replace(/^(\d+)([.)])/, '$1\\$2')
    .replace(/^([-+])(\s|$)/, '\\$1$2');
}

/** Markdown: a heading, the poem with each line kept as a line, the source, and the notes if any. */
export function poemToMarkdown({ title, lines, attribution, notes }: PoemDocument): string {
  // Two trailing spaces make a line break inside a paragraph; the blank lines between stanzas stay blank.
  const verse = lines.map(line => `${escapeMarkdown(line)}  `);
  const parts = [
    `# ${escapeMarkdown(cleanTitle(title))}`,
    verse.join('\n').trimEnd(),
    `*${escapeMarkdown(sourceLine(attribution))}* · [${escapeMarkdown(attribution.source)}](${attribution.url})`,
  ];
  const note = notes?.trim();
  if (note) {
    const body = note.split(/\r?\n/).map(line => `${escapeMarkdown(line)}  `).join('\n').trimEnd();
    parts.push(`## Notes\n\n${body}`);
  }
  return parts.filter(part => part !== '').join('\n\n') + '\n';
}

/** Saves a string as a file the browser downloads. Browser-only. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the download a moment to start before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
