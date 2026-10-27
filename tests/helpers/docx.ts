import { deflateRawSync } from 'node:zlib';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The XML of a Word document with these paragraphs (an empty string is an empty paragraph). Runs are split mid-word, as Word does. */
export function documentXml(paragraphs: string[]): string {
  const body = paragraphs
    .map(text => {
      if (text === '') return '<w:p/>';
      const half = Math.ceil(text.length / 2);
      const runs = [text.slice(0, half), text.slice(half)]
        .filter(Boolean)
        .map(run => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(run)}</w:t></w:r>`);
      return `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${runs.join('')}</w:p>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** 0 stored, 8 deflated. */
  method?: 0 | 8;
}

/** A zip file with these entries, written the way Word writes one (local headers, then the directory at the end). */
export function makeZip(entries: ZipEntry[], comment = ''): Uint8Array {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 8;
    const name = Buffer.from(entry.name);
    const stored = method === 8 ? deflateRawSync(entry.data) : Buffer.from(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, stored);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + stored.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return new Uint8Array(Buffer.concat([...parts, directoryBytes, end, Buffer.from(comment)]));
}

/** A .docx file with these paragraphs. */
export function makeDocx(paragraphs: string[], method: 0 | 8 = 8): Uint8Array {
  return makeZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>'), method },
    { name: 'word/styles.xml', data: Buffer.from('<w:styles/>'), method },
    { name: 'word/document.xml', data: Buffer.from(documentXml(paragraphs)), method },
  ]);
}

/** Something with what a File has that the reader uses, so that a test does not depend on the test environment's File. */
export function fakeFile(name: string, bytes: Uint8Array | string, size?: number): File {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return {
    name,
    size: size ?? data.length,
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  } as unknown as File;
}
