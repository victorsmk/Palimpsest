// Imports books from Project Gutenberg text files into the library (see "Adding books" in the README).
//
//   node scripts/import-library.mjs --list data/library/pilot.json [--raw data/library/raw] [--dry-run]
//
// It reads files you have saved yourself (it downloads nothing, so it cannot trouble Gutenberg's servers):
// for each book in the list, the file <raw>/pg<number>.txt. It checks that the file is the book the list
// says, cuts it into excerpts, and (unless --dry-run) adds the book to the database named by DATABASE_URL.
// A book that is already in the database is left exactly as it is.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CUTTER_VERSION, checkHeader, cutBook } from './library/cut.mjs';
import { libraryBytes, saveBook } from './library/store.mjs';
import { createPgDb } from './library/pg.mjs';

const LAST_PUBLIC_DOMAIN_YEAR = 1930; // in the USA, books first published up to this year are public domain in 2026

export function parseArgs(argv) {
  const args = { list: null, raw: 'data/library/raw', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--list') args.list = argv[++i];
    else if (arg === '--raw') args.raw = argv[++i];
    else throw new Error(`I do not know what ${arg} means.`);
  }
  if (!args.list) throw new Error('Say which list of books to import: --list data/library/pilot.json');
  return args;
}

/** The list, checked: each book has a Gutenberg number, a title, an author, and a year that is public domain. */
export function readList(path) {
  const list = JSON.parse(readFileSync(path, 'utf-8'));
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${path} is not a list of books.`);
  const seen = new Set();
  for (const entry of list) {
    const bad = [];
    if (!Number.isInteger(entry.gutenbergId) || entry.gutenbergId < 1) bad.push('gutenbergId');
    if (typeof entry.title !== 'string' || !entry.title.trim()) bad.push('title');
    if (typeof entry.author !== 'string' || !entry.author.trim()) bad.push('author');
    if (!Number.isInteger(entry.year)) bad.push('year');
    if (entry.form !== undefined && entry.form !== 'prose' && entry.form !== 'verse') bad.push('form (prose or verse)');
    if (bad.length > 0) throw new Error(`${path}: an entry has a missing or wrong ${bad.join(', ')}: ${JSON.stringify(entry)}`);
    if (entry.year > LAST_PUBLIC_DOMAIN_YEAR) {
      throw new Error(`${entry.title} was published in ${entry.year}. Only books published in ${LAST_PUBLIC_DOMAIN_YEAR} or before are known to be public domain in the USA, so it is not imported.`);
    }
    if (seen.has(entry.gutenbergId)) throw new Error(`${path}: Gutenberg number ${entry.gutenbergId} is listed twice.`);
    seen.add(entry.gutenbergId);
  }
  return list;
}

const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Cuts each book of the list from its file. Returns what was found; changes nothing. */
export function prepare(list, rawDir) {
  const books = [];
  const problems = [];
  for (const entry of list) {
    const file = join(rawDir, `pg${entry.gutenbergId}.txt`);
    if (!existsSync(file)) {
      problems.push(`${entry.title}: no file ${file}. Save “Plain Text UTF-8” from https://www.gutenberg.org/ebooks/${entry.gutenbergId} as that name.`);
      continue;
    }
    const raw = readFileSync(file, 'utf-8');
    const header = checkHeader(raw, entry);
    if (!header.ok) {
      problems.push(`${entry.title}: not imported, ${header.problems.join('; ')}.`);
      continue;
    }
    try {
      const excerpts = cutBook(raw, entry);
      books.push({ entry, excerpts, words: excerpts.reduce((sum, e) => sum + e.wordCount, 0), bytes: excerpts.reduce((sum, e) => sum + Buffer.byteLength(e.sourceText), 0) });
    } catch (error) {
      problems.push(`${entry.title}: not imported, ${error.message}`);
    }
  }
  return { books, problems };
}

export async function main(argv, log = console.log) {
  const args = parseArgs(argv);
  const list = readList(args.list);
  const { books, problems } = prepare(list, resolve(args.raw));

  log(`Cutting rules version ${CUTTER_VERSION}. ${list.length} books in the list.`);
  for (const { entry, excerpts, words, bytes } of books) {
    log(`  ${entry.title} (${entry.author}, ${entry.year}${entry.form === 'verse' ? ', verse' : ''}): ${excerpts.length} excerpts, ${words.toLocaleString('en')} words, ${megabytes(bytes)} of text`);
  }
  const totalBytes = books.reduce((sum, b) => sum + b.bytes, 0);
  log(`Together: ${books.length} books, ${books.reduce((s, b) => s + b.excerpts.length, 0).toLocaleString('en')} excerpts, ${megabytes(totalBytes)} of text.`);
  for (const problem of problems) log(`  PROBLEM: ${problem}`);

  if (args.dryRun) {
    log('Dry run: nothing was written to any database.');
    return { books: books.length, problems: problems.length, written: 0 };
  }

  try {
    process.loadEnvFile('.env.local');
  } catch {
    /* no such file: DATABASE_URL may be set some other way */
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Put it in .env.local (the same pooled connection string the site uses), or set it for this command.');
  const db = createPgDb(process.env.DATABASE_URL);
  let written = 0;
  try {
    for (const { entry, excerpts } of books) {
      const outcome = await saveBook(db, entry, excerpts);
      log(`  ${entry.title}: ${outcome === 'added' ? 'added' : 'already in the library, left as it is'}`);
      if (outcome === 'added') written++;
    }
    log(`Library tables now take ${megabytes(await libraryBytes(db))} in the database (the free plan holds 500 MB in all).`);
  } finally {
    await db.end();
  }
  return { books: books.length, problems: problems.length, written };
}

// Run as a command (not when the tests import it).
if (process.argv[1]?.endsWith('import-library.mjs')) {
  main(process.argv.slice(2)).then(
    result => process.exit(result.problems > 0 ? 2 : 0),
    error => {
      console.error(`Stopped: ${error.message}`);
      process.exit(1);
    }
  );
}
