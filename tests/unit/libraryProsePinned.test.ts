import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { cutBook } from '../../scripts/library/cut.mjs';

// The way prose is cut is frozen: books already in the database were cut this way, and a saved poem points at the
// words of an excerpt by position. These pin the exact output (every excerpt's id, title, description and text) for
// real books, so that work on other kinds of text (verse) cannot change it without a test failing. If a change to
// the prose rules is ever intended, it needs a new cutter version, and books already imported must be left alone.

const fingerprint = (excerpts: unknown) => createHash('sha256').update(JSON.stringify(excerpts)).digest('hex');
const entry = (gutenbergId: number, title: string) => ({ gutenbergId, title, author: 'x', year: 1900 });

describe('prose is cut exactly as it was', () => {
  const pinned = [
    { file: 'jane-eyre', entry: entry(1260, 'Jane Eyre'), excerpts: 382, hash: 'eed9506a9c4b30a30cc25fdc1ed384d04cb445a37d24ad48b41fab2328c0144e' },
    { file: 'dorian-gray', entry: entry(174, 'The Picture of Dorian Gray'), excerpts: 163, hash: '4304ecb2149b4ee95b760225b090bb1aae20530615063860884889e562b042f5' },
    { file: 'walden', entry: entry(205, 'Walden'), excerpts: 235, hash: '2ef7f561bcaf5a8737049e114b83d7b60a340be327d3fc1d3fef97885efd4db4' },
  ];

  it.each(pinned)('$file: the same excerpts, word for word', ({ file, entry: e, excerpts, hash }) => {
    const cut = cutBook(readFileSync(`data/texts/${file}-raw.txt`, 'utf-8'), e);
    expect(cut).toHaveLength(excerpts);
    expect(fingerprint(cut)).toBe(hash);
  });

  // The ten pilot books are in the database already. Their files are not in the repository (they are large and
  // saved by hand), so this runs only where they are.
  const pilot = [
    [1342, 'Pride and Prejudice', 255, '2ddedb42ba1c0284'],
    [84, 'Frankenstein', 149, '5f37a4c788b7466e'],
    [2701, 'Moby Dick', 425, '0ec1cdb4ebe54dce'],
    [11, "Alice's Adventures in Wonderland", 54, 'a2318d89b97de22b'],
    [345, 'Dracula', 324, '0b1fb2b4bbaeafbb'],
    [98, 'A Tale of Two Cities', 280, '34dbc7e3cbe5902f'],
    [1661, 'The Adventures of Sherlock Holmes', 211, 'c2cbe57e1c07d133'],
    [76, 'Adventures of Huckleberry Finn', 222, '6020f25b175d7e8c'],
    [1400, 'Great Expectations', 377, '546396b44d80024c'],
  ] as const;

  it.skipIf(!pilot.every(([id]) => existsSync(`data/library/raw/pg${id}.txt`)))('the pilot books: the same excerpts as the ones in the database', () => {
    for (const [id, title, count, hash] of pilot) {
      const cut = cutBook(readFileSync(`data/library/raw/pg${id}.txt`, 'utf-8'), entry(id, title));
      expect(cut, title).toHaveLength(count);
      expect(fingerprint(cut).slice(0, 16), title).toBe(hash);
    }
  });
});
