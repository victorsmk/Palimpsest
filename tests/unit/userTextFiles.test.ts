// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import {
  decodeText,
  readDocxParagraphs,
  readTextFile,
  suggestForm,
  textFromParagraphs,
  titleFromFileName,
  FileReadError,
  MAX_FILE_BYTES,
} from '@/lib/userTexts/files';
import { fakeFile, makeDocx, makeZip, documentXml } from '../helpers/docx';

const fails = async (work: Promise<unknown>, message: RegExp) => {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(FileReadError);
  expect((error as Error).message).toMatch(message);
};

describe('a file name as a title', () => {
  it('drops the extension and the underscores', () => {
    expect(titleFromFileName('my_poems-2024.txt')).toBe('my poems 2024');
    expect(titleFromFileName('Moby Dick.docx')).toBe('Moby Dick');
    expect(titleFromFileName('noextension')).toBe('noextension');
  });
});

describe('reading plain text', () => {
  it('reads UTF-8, with or without a byte order mark', () => {
    expect(decodeText(new TextEncoder().encode('Brontë — “quoted”'))).toBe('Brontë — “quoted”');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]))).toBe('hi');
  });

  it('reads an old Windows file (Western encoding) when it is not UTF-8', () => {
    expect(decodeText(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x68, 0x69, 0x94]))).toBe('Café “hi”');
  });

  it('refuses a binary file', () => {
    expect(() => decodeText(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02]))).toThrow(FileReadError);
  });
});

describe('reading a Word file', () => {
  it('gives its paragraphs, putting the pieces of a paragraph together', async () => {
    const paragraphs = await readDocxParagraphs(makeDocx(['First paragraph, in two runs.', '', 'Second & <last> one.']));
    expect(paragraphs).toEqual(['First paragraph, in two runs.', '', 'Second & <last> one.']);
  });

  it('reads a document whose parts are stored, not deflated', async () => {
    expect(await readDocxParagraphs(makeDocx(['Stored text.'], 0))).toEqual(['Stored text.']);
  });

  it('reads a zip that has a comment after its directory, and other entries before the document', async () => {
    const zip = makeZip(
      [
        { name: 'a/b.txt', data: new TextEncoder().encode('x') },
        { name: 'word/document.xml', data: new TextEncoder().encode(documentXml(['Found it.'])) },
      ],
      'a comment at the end',
    );
    expect(await readDocxParagraphs(zip)).toEqual(['Found it.']);
  });

  it('makes a text of paragraphs: a blank line between, and the lines of a poem kept', () => {
    const long1 = 'One long paragraph of prose that runs on for a good while past the length of a line of verse.';
    const long2 = 'Another one that is also long enough to be prose and not poetry at all, I think.';
    expect(textFromParagraphs([long1, '', long2])).toBe(`${long1}\n\n${long2}`);
    expect(textFromParagraphs(['Roses are red', 'Violets are blue', '', 'Sugar is sweet', 'And so are you'])).toBe(
      'Roses are red\nViolets are blue\n\nSugar is sweet\nAnd so are you',
    );
    expect(textFromParagraphs(['A', 'B', 'C'])).toBe('A\n\nB\n\nC');
  });

  it('refuses a file that is not a zip, a zip that is not a Word file, and a damaged one', async () => {
    await fails(readDocxParagraphs(new TextEncoder().encode('just some text, not a zip file at all')), /Word \(\.docx\)/);
    await fails(readDocxParagraphs(makeZip([{ name: 'readme.txt', data: new TextEncoder().encode('hi') }])), /Word \(\.docx\)/);
    const good = makeDocx(['text']);
    await fails(readDocxParagraphs(good.slice(0, good.length - 30)), /Word \(\.docx\)/);
    await fails(
      readDocxParagraphs(makeZip([{ name: 'word/document.xml', data: new TextEncoder().encode('<w:document><unclosed>') }])),
      /Word \(\.docx\)/,
    );
  });

  it('refuses a file that unpacks to far more than it is (a zip bomb), without unpacking it all', async () => {
    const bomb = makeZip([{ name: 'word/document.xml', data: new Uint8Array(40 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(200_000);
    await fails(readDocxParagraphs(bomb), /too large/);
  });

  it('refuses an entry with a method it does not know', async () => {
    const zip = makeZip([{ name: 'word/document.xml', data: deflateRawSync(Buffer.from('x')), method: 0 }]);
    const view = new DataView(zip.buffer);
    // the central directory entry's method field (offset 10 in the entry): set it to bzip2 (12)
    for (let at = zip.length - 22; at >= 0; at--) {
      if (view.getUint32(at, true) === 0x02014b50) {
        view.setUint16(at + 10, 12, true);
        break;
      }
    }
    await fails(readDocxParagraphs(zip), /Word \(\.docx\)/);
  });
});

describe('guessing whether a text is verse', () => {
  it('says verse for short lines in groups, and prose for wrapped paragraphs or a text with no groups', () => {
    expect(suggestForm('Roses are red\nViolets are blue\n\nSugar is sweet\nAnd so are you')).toBe('verse');
    const wrapped = 'It was the best of times, it was the worst of times, it was the age of\nwisdom, it was the age of foolishness, it was the epoch of belief, it was\n\n'.repeat(3);
    expect(suggestForm(wrapped)).toBe('prose');
    expect(suggestForm('short line\nshort line\nshort line\nshort line\nshort line')).toBe('prose');
    expect(suggestForm('')).toBe('prose');
  });
});

describe('reading a file the reader chose', () => {
  it('reads a .txt file, and gives its name as the title', async () => {
    const file = await readTextFile(fakeFile('my_story.txt', 'Once upon a time.\r\n\r\nThe end.\r\n'));
    expect(file).toEqual({ text: 'Once upon a time.\n\nThe end.', title: 'my story', form: 'prose' });
  });

  it('reads a .docx file', async () => {
    const file = await readTextFile(fakeFile('Poems.DOCX', makeDocx(['Roses are red', 'Violets are blue', '', 'Sugar is sweet', 'And so are you'])));
    expect(file.title).toBe('Poems');
    expect(file.form).toBe('verse');
    expect(file.text).toContain('Roses are red\nViolets are blue\n\nSugar is sweet');
  });

  it('says what to do about a PDF, and about other kinds of file', async () => {
    await fails(readTextFile(fakeFile('book.pdf', '%PDF-1.4')), /PDF files cannot be read yet/);
    await fails(readTextFile(fakeFile('old.doc', 'x')), /plain text \(\.txt\) or as a Word file/);
    await fails(readTextFile(fakeFile('photo.png', 'x')), /plain text/);
  });

  it('refuses an empty file, a file with only spaces, and a file that is too large without reading it', async () => {
    await fails(readTextFile(fakeFile('a.txt', '')), /empty/);
    await fails(readTextFile(fakeFile('a.txt', '  \n\n  ')), /no text/);
    await fails(readTextFile(fakeFile('a.txt', 'x', MAX_FILE_BYTES + 1)), /too large/);
  });
});
