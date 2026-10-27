import { normalizeText, type TextForm } from './cut';

/** What a reader is told when a file cannot be used. The messages are for them, so they say what to do. */
export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileReadError';
  }
}

/** The largest file that is read: a long novel is about 1 MB of text. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** The most that a .docx may unpack to; a file that unpacks to more is refused (a zip can be made to). */
const MAX_UNPACKED_BYTES = 30 * 1024 * 1024;

const UNSUPPORTED = /\.(pdf|doc|rtf|odt|pages|epub|mobi|html?|png|jpe?g|gif|zip)$/i;

/** The words of a file's name as a title: "my_poems-2024.txt" is "my poems 2024". */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text of a plain-text file: UTF-8 if it is that, and otherwise the Windows Western encoding old files are in. */
export function decodeText(bytes: Uint8Array): string {
  // A binary file (a picture, a PDF) is full of zero bytes; text has none.
  const sample = bytes.subarray(0, 8192);
  if (sample.includes(0)) throw new FileReadError('That does not look like a text file. Save it as a plain text file (.txt) and try again.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ─── .docx: a zip of XML files; the words are in word/document.xml ────────────────────────────────────────────

const u16 = (view: DataView, at: number) => view.getUint16(at, true);
const u32 = (view: DataView, at: number) => view.getUint32(at, true);
const NOT_DOCX = 'That does not look like a Word (.docx) file. Save it again from Word as .docx, or as plain text (.txt).';
const TOO_BIG_DOCX = 'That Word file is too large to read here. Save it as plain text (.txt) instead.';

/** Where an entry of a zip file is, found from the zip's directory at its end. */
function findZipEntry(bytes: Uint8Array, wanted: string): { method: number; compressed: Uint8Array } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-directory record is in the last 64 KB, with room for a comment after it.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (u32(view, at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new FileReadError(NOT_DOCX);
  const entries = u16(view, end + 10);
  let at = u32(view, end + 16);
  if (entries === 0xffff || at === 0xffffffff) throw new FileReadError(TOO_BIG_DOCX);

  for (let i = 0; i < entries; i++) {
    if (at + 46 > bytes.length || u32(view, at) !== 0x02014b50) throw new FileReadError(NOT_DOCX);
    const method = u16(view, at + 10);
    const compressedSize = u32(view, at + 20);
    const nameLength = u16(view, at + 28);
    const extraLength = u16(view, at + 30);
    const commentLength = u16(view, at + 32);
    const localAt = u32(view, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (name === wanted) {
      if (localAt + 30 > bytes.length || u32(view, localAt) !== 0x04034b50) throw new FileReadError(NOT_DOCX);
      const start = localAt + 30 + u16(view, localAt + 26) + u16(view, localAt + 28);
      if (start + compressedSize > bytes.length) throw new FileReadError(NOT_DOCX);
      return { method, compressed: bytes.subarray(start, start + compressedSize) };
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** The bytes of a deflated entry, refusing to unpack more than `cap`. */
async function inflate(compressed: Uint8Array, cap: number): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(compressed as Uint8Array<ArrayBuffer>);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw'));
  // (what comes out is chunks of bytes)
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) {
      await reader.cancel();
      throw new FileReadError(TOO_BIG_DOCX);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** The paragraphs of a .docx file's text, an empty one for each empty paragraph. */
export async function readDocxParagraphs(bytes: Uint8Array): Promise<string[]> {
  const entry = findZipEntry(bytes, 'word/document.xml');
  if (!entry) throw new FileReadError(NOT_DOCX);
  let xml: Uint8Array;
  try {
    if (entry.method === 0) xml = entry.compressed;
    else if (entry.method === 8) xml = await inflate(entry.compressed, MAX_UNPACKED_BYTES);
    else throw new FileReadError(NOT_DOCX);
  } catch (error) {
    if (error instanceof FileReadError) throw error;
    throw new FileReadError(NOT_DOCX);
  }
  const document = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) throw new FileReadError(NOT_DOCX);

  const paragraphs: string[] = [];
  for (const paragraph of Array.from(document.getElementsByTagNameNS(WORD_NS, 'p'))) {
    let text = '';
    const walk = (node: Element) => {
      for (const child of Array.from(node.children)) {
        if (child.namespaceURI === WORD_NS && child.localName === 't') text += child.textContent ?? '';
        else if (child.namespaceURI === WORD_NS && (child.localName === 'tab' || child.localName === 'br' || child.localName === 'cr')) text += ' ';
        else if (child.namespaceURI === WORD_NS && child.localName === 'noBreakHyphen') text += '-';
        else walk(child);
      }
    };
    walk(paragraph);
    paragraphs.push(text.replace(/\s+/g, ' ').trim());
  }
  return paragraphs;
}

// ─── Telling the form, and reading a file ────────────────────────────────────────────────────────────────────

/** Lines of verse are short: a line of prose in a plain text file is wrapped at 70 to 75 characters. */
const SHORT_LINE = 55;

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * A .docx file's paragraphs as text. Prose has a blank line between paragraphs. A document of short paragraphs
 * with empty ones between groups of them is verse (a line to a paragraph, a stanza between empty ones), and keeps
 * that layout.
 */
export function textFromParagraphs(paragraphs: string[]): string {
  const filled = paragraphs.filter(Boolean);
  const hasGaps = paragraphs.some((paragraph, i) => paragraph === '' && i > 0 && i < paragraphs.length - 1);
  if (hasGaps && median(filled.map(paragraph => paragraph.length)) <= SHORT_LINE) return paragraphs.join('\n');
  return filled.join('\n\n');
}

/** A guess at whether a text is verse: short lines, in groups with a blank line between. The reader can change it. */
export function suggestForm(text: string): TextForm {
  const lines = normalizeText(text).split('\n');
  const filled = lines.filter(line => line.trim() !== '');
  const groups = lines.filter((line, i) => line.trim() === '' && i > 0 && lines[i - 1].trim() !== '').length;
  return filled.length >= 4 && groups >= 1 && median(filled.map(line => line.trim().length)) <= SHORT_LINE ? 'verse' : 'prose';
}

export interface ReadFile {
  text: string;
  /** The file's name as a title, to start from. */
  title: string;
  form: TextForm;
}

/** What a file holds, as text. Plain text (.txt) and Word (.docx) are read; anything else is refused, saying what to do. */
export async function readTextFile(file: File): Promise<ReadFile> {
  if (file.size > MAX_FILE_BYTES) throw new FileReadError('That file is too large. The most that can be added is about 5 MB, which is a very long book.');
  if (file.size === 0) throw new FileReadError('That file is empty.');
  const name = file.name;
  let text: string;
  if (/\.docx$/i.test(name)) {
    text = textFromParagraphs(await readDocxParagraphs(new Uint8Array(await file.arrayBuffer())));
  } else if (UNSUPPORTED.test(name)) {
    throw new FileReadError(
      /\.pdf$/i.test(name)
        ? 'PDF files cannot be read yet. Copy the text out of it and paste it in, or save it as plain text (.txt).'
        : 'That kind of file cannot be read. Save it as plain text (.txt) or as a Word file (.docx), or paste the text in.',
    );
  } else {
    text = decodeText(new Uint8Array(await file.arrayBuffer()));
  }
  text = normalizeText(text);
  if (text === '') throw new FileReadError('There is no text in that file.');
  return { text, title: titleFromFileName(name), form: suggestForm(text) };
}
