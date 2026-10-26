import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUTTER_VERSION, cutBook } from '../../scripts/library/cut.mjs';
import { saveBook } from '../../scripts/library/store.mjs';
import { poolConfigFor as scriptPoolConfig } from '../../scripts/library/pg.mjs';
import { main, parseArgs, prepare, readList } from '../../scripts/import-library.mjs';
import { poolConfigFor } from '@/lib/server/pgDb';
import { createTestDb } from '../helpers/pgliteDb';

// Putting books into the database, and the command that does it: what is stored, that a book already there is
// left exactly as it is, and that a wrong file or a book too new for the public domain is refused.

const db = await createTestDb();
afterAll(() => db.close());

const scratch = mkdtempSync(join(tmpdir(), 'palimpsest-library-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const para = (n: number, mark: string) => `${Array.from({ length: n - 1 }, (_, i) => `${mark}${i}`).join(' ')} end.`;
const gutenberg = (title: string, author: string, body: string) =>
  `Title: ${title}\n\nAuthor: ${author}\n\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\n${body}\n\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n`;
const entryFor = (id: number, overrides = {}) => ({ gutenbergId: id, title: 'A Book', author: 'An Author', year: 1900, ...overrides });
const aBook = (id: number) => {
  const entry = entryFor(id);
  const excerpts = cutBook(gutenberg('A Book', 'Author, An', [para(500, 'a'), para(500, 'b'), para(500, 'c')].join('\n\n')), entry);
  return { entry, excerpts };
};
const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: number }>(sql, params)).rows[0].n);

describe('saving a book', () => {
  it('adds the book and every excerpt, with the facts about the book', async () => {
    const { entry, excerpts } = aBook(1001);
    expect(await saveBook(db, entry, excerpts)).toBe('added');
    const book = (await db.query('select * from books where id = $1', ['pg1001'])).rows[0] as Record<string, unknown>;
    expect(book).toMatchObject({
      id: 'pg1001',
      gutenberg_id: 1001,
      title: 'A Book',
      author: 'An Author',
      year: 1900,
      language: 'en',
      source: 'Project Gutenberg',
      url: 'https://www.gutenberg.org/ebooks/1001',
      license_note: 'Public domain in the USA',
      passage_count: 3,
      word_count: 1500,
      cutter_version: CUTTER_VERSION,
    });
    const passages = (await db.query('select * from passages where book_id = $1 order by ordinal', ['pg1001'])).rows as Record<string, unknown>[];
    expect(passages.map(p => p.id)).toEqual(['pg1001-0001', 'pg1001-0002', 'pg1001-0003']);
    expect(passages[0]).toMatchObject({ ordinal: 1, title: 'A Book — Part 1', word_count: 500, source_text: excerpts[0].sourceText, description: excerpts[0].description });
  });

  it('stores a book of many excerpts, across the batches', async () => {
    const entry = entryFor(1002);
    const body = Array.from({ length: 250 }, (_, i) => para(460, `m${i}x`)).join('\n\n');
    const excerpts = cutBook(gutenberg('A Book', 'Author, An', body), entry);
    expect(excerpts).toHaveLength(250);
    await saveBook(db, entry, excerpts);
    expect(await count('select count(*)::int as n from passages where book_id = $1', ['pg1002'])).toBe(250);
    expect((await db.query<{ source_text: string }>('select source_text from passages where id = $1', ['pg1002-0250'])).rows[0].source_text).toBe(excerpts[249].sourceText);
  });

  it('leaves a book that is already there exactly as it is, even if given other excerpts', async () => {
    const { entry, excerpts } = aBook(1003);
    await saveBook(db, entry, excerpts);
    const other = cutBook(gutenberg('A Book', 'Author, An', para(900, 'z')), entry);
    expect(await saveBook(db, { ...entry, title: 'Changed', year: 1850 }, other)).toBe('exists');
    expect(await count('select count(*)::int as n from passages where book_id = $1', ['pg1003'])).toBe(3);
    const row = (await db.query<{ title: string; year: number }>('select title, year from books where id = $1', ['pg1003'])).rows[0];
    expect(row).toEqual({ title: 'A Book', year: 1900 });
    expect((await db.query<{ source_text: string }>('select source_text from passages where id = $1', ['pg1003-0001'])).rows[0].source_text).toBe(excerpts[0].sourceText);
  });

  it('adds nothing at all if any excerpt cannot be added', async () => {
    const { entry, excerpts } = aBook(1004);
    const broken = [excerpts[0], { ...excerpts[1], ordinal: 1, id: 'pg1004-0009' }, excerpts[2]];
    await expect(saveBook(db, entry, broken)).rejects.toThrow();
    expect(await count('select count(*)::int as n from books where id = $1', ['pg1004'])).toBe(0);
    expect(await count('select count(*)::int as n from passages where book_id = $1', ['pg1004'])).toBe(0);
  });

  it('removes a book’s excerpts with the book', async () => {
    const { entry, excerpts } = aBook(1005);
    await saveBook(db, entry, excerpts);
    await db.query('delete from books where id = $1', ['pg1005']);
    expect(await count('select count(*)::int as n from passages where book_id = $1', ['pg1005'])).toBe(0);
  });

  it('keeps the same Gutenberg book from being added twice under another name', async () => {
    const { entry, excerpts } = aBook(1006);
    await saveBook(db, entry, excerpts);
    expect(await saveBook(db, { ...entry }, excerpts)).toBe('exists');
    expect(await count('select count(*)::int as n from books where gutenberg_id = 1006')).toBe(1);
  });
});

describe('the list of books', () => {
  const listFile = (content: unknown, name = 'list.json') => {
    const path = join(scratch, name);
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
    return path;
  };

  it('is read when each book has a number, a title, an author and a year', () => {
    expect(readList(listFile([entryFor(1), entryFor(2)]))).toHaveLength(2);
  });

  it('refuses a book published after 1930, which is not known to be public domain in the USA', () => {
    expect(() => readList(listFile([entryFor(1, { year: 1931, title: 'Too New' })]))).toThrow(/Too New was published in 1931.*not imported/);
    expect(readList(listFile([entryFor(1, { year: 1930 })]))).toHaveLength(1);
  });

  it.each([
    ['no number', { gutenbergId: undefined }],
    ['a number that is not a whole number', { gutenbergId: 1.5 }],
    ['no title', { title: ' ' }],
    ['no author', { author: undefined }],
    ['a year that is text', { year: '1900' }],
  ])('refuses an entry with %s', (_label, overrides) => {
    expect(() => readList(listFile([entryFor(1, overrides)]))).toThrow(/missing or wrong/);
  });

  it('refuses a number listed twice, an empty list, and something that is not a list', () => {
    expect(() => readList(listFile([entryFor(1), entryFor(1)]))).toThrow(/listed twice/);
    expect(() => readList(listFile([]))).toThrow(/not a list/);
    expect(() => readList(listFile({ books: [] }))).toThrow(/not a list/);
  });

  it('is the pilot list in the repository, which is valid, with each book public domain', () => {
    const list = readList('data/library/pilot.json');
    expect(list.length).toBeGreaterThanOrEqual(10);
    expect(new Set(list.map((b: { gutenbergId: number }) => b.gutenbergId)).size).toBe(list.length);
  });
});

describe('the command', () => {
  const rawDir = join(scratch, 'raw');
  mkdirSync(rawDir, { recursive: true });
  const jane = join(rawDir, 'pg1260.txt');
  copyFileSync('data/texts/jane-eyre-raw.txt', jane);
  writeFileSync(join(rawDir, 'pg55.txt'), gutenberg('Another Book', 'Somebody, Else', para(900, 'q')));
  const list = join(scratch, 'command-list.json');
  writeFileSync(
    list,
    JSON.stringify([
      { gutenbergId: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë', year: 1847 },
      { gutenbergId: 55, title: 'The Wrong Title', author: 'Somebody Else', year: 1900 },
      { gutenbergId: 56, title: 'Not Saved', author: 'Nobody', year: 1900 },
    ])
  );

  it('reads its arguments, and refuses ones it does not know or no list', () => {
    expect(parseArgs(['--list', 'a.json', '--raw', 'dir', '--dry-run'])).toEqual({ list: 'a.json', raw: 'dir', dryRun: true });
    expect(parseArgs(['--list', 'a.json'])).toEqual({ list: 'a.json', raw: 'data/library/raw', dryRun: false });
    expect(() => parseArgs(['--list', 'a.json', '--force'])).toThrow(/--force/);
    expect(() => parseArgs([])).toThrow(/--list/);
  });

  it('cuts the books it has files for, and reports each one that it cannot import and why', () => {
    const { books, problems } = prepare(readList(list), rawDir);
    expect(books.map((b: { entry: { title: string } }) => b.entry.title)).toEqual(['Jane Eyre']);
    expect(books[0].excerpts.length).toBeGreaterThan(300);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('The Wrong Title: not imported, the file’s title is “Another Book”');
    expect(problems[1]).toContain('no file');
    expect(problems[1]).toContain('https://www.gutenberg.org/ebooks/56');
  });

  it('says what it found on a dry run, writes to no database, and asks for no connection', async () => {
    const lines: string[] = [];
    const before = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const result = await main(['--list', list, '--raw', rawDir, '--dry-run'], line => lines.push(line));
    process.env.DATABASE_URL = before;
    expect(result).toEqual({ books: 1, problems: 2, written: 0 });
    const report = lines.join('\n');
    expect(report).toContain('Jane Eyre (Charlotte Brontë, 1847): 38');
    expect(report).toContain('Dry run: nothing was written to any database.');
    expect(report).toContain('PROBLEM:');
  });

  it('stops, without writing, when a real run has no database to write to', async () => {
    const before = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const cwd = process.cwd();
    process.chdir(scratch); // no .env.local here
    try {
      await expect(main(['--list', list, '--raw', rawDir], () => {})).rejects.toThrow(/DATABASE_URL is not set/);
    } finally {
      process.chdir(cwd);
      if (before !== undefined) process.env.DATABASE_URL = before;
    }
  });

  it('runs as a command in plain Node, and its exit code says whether anything was wrong', () => {
    const run = (args: string[]) => spawnSync(process.execPath, ['scripts/import-library.mjs', ...args], { encoding: 'utf-8' });
    const withProblems = run(['--list', list, '--raw', rawDir, '--dry-run']);
    expect(withProblems.status).toBe(2);
    expect(withProblems.stdout).toContain('Jane Eyre');
    const clean = join(scratch, 'clean.json');
    writeFileSync(clean, JSON.stringify([{ gutenbergId: 1260, title: 'Jane Eyre', author: 'Charlotte Brontë', year: 1847 }]));
    const fine = run(['--list', clean, '--raw', rawDir, '--dry-run']);
    expect(fine.status).toBe(0);
    const bad = run([]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('Stopped: Say which list');
  });

  it('is never run by merely importing it', () => {
    const out = execFileSync(process.execPath, ['-e', "import('./scripts/import-library.mjs').then(() => console.log('imported quietly'))"], { encoding: 'utf-8' });
    expect(out.trim()).toBe('imported quietly');
  });
});

describe('the script’s own connection to the database', () => {
  const strings = [
    'postgres://u:p@aws-0-eu.pooler.supabase.com:6543/postgres?sslmode=require',
    'postgres://u:p@localhost:5432/db',
    'postgres://u:p@localhost/db?sslmode=disable',
    'postgres://u:p@h:6543/postgres?sslmode=require&application_name=palimpsest',
    'not a url',
  ];

  it.each(strings)('reads %s as the server does', string => {
    expect(scriptPoolConfig(string, { max: 3 })).toEqual(poolConfigFor(string, { max: 3 }));
    expect(scriptPoolConfig(string, { caCert: 'PEM', max: 3 })).toEqual(poolConfigFor(string, { caCert: 'PEM', max: 3 }));
  });

  it('holds few connections by default', () => {
    expect(scriptPoolConfig('postgres://u:p@h/db').max).toBe(2);
  });
});
