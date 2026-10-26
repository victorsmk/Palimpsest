import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cutBook } from '../../scripts/library/cut.mjs';
import { saveBook } from '../../scripts/library/store.mjs';
import type { Db } from './db';

/** The three Gutenberg files that are in the repository, as books of the demo's library. */
const DEMO_BOOKS = [
  { file: 'jane-eyre-raw.txt', entry: { gutenbergId: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë', year: 1847 } },
  { file: 'dorian-gray-raw.txt', entry: { gutenbergId: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', year: 1890 } },
  { file: 'walden-raw.txt', entry: { gutenbergId: 205, title: 'Walden', author: 'Henry David Thoreau', year: 1854 } },
] as const;

/**
 * Puts three real books into the library of the local demo, cut by the same rules as the import command
 * (scripts/import-library.mjs), so the demo has books to find without any account or download.
 */
export async function seedDemoLibrary(db: Db, directory = join(process.cwd(), 'data', 'texts')): Promise<void> {
  for (const { file, entry } of DEMO_BOOKS) {
    const excerpts = cutBook(readFileSync(join(directory, file), 'utf-8'), entry);
    await saveBook(db, entry, excerpts);
  }
}
