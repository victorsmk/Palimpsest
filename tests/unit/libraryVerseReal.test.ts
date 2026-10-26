import { describe, it, expect, afterAll } from 'vitest';
import { LINE_SEPARATOR } from '../../scripts/library/cut.mjs';
import { saveBook } from '../../scripts/library/store.mjs';
import { readList } from '../../scripts/import-library.mjs';
import { tokenize } from '@/lib/tokenizer';
import { createLibraryApi } from '@/lib/server/api/library';
import { HttpBookRepository } from '@/lib/repositories/http/HttpBookRepository';
import type { PoemsApi } from '@/lib/server/api/handlers';
import { createTestDb } from '../helpers/pgliteDb';
import { inProcessFetch } from '../helpers/inProcessApi';
import { VERSE_BOOK, VERSE_FILE, excerptsOf, seedRealBooks, seedVerseBook, verseExcerpts } from '../helpers/library';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LS = LINE_SEPARATOR;
const db = await createTestDb();
await seedRealBooks(db, 'dorianGray');
await seedVerseBook(db);
afterAll(() => db.close());
const repo = new HttpBookRepository({ fetch: inProcessFetch({} as PoemsApi, createLibraryApi({ db })) });

describe('a book of verse as Gutenberg gives it', () => {
  it('is found to have four poems, and they are packed into one excerpt named for them', () => {
    const excerpts = verseExcerpts();
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].title).toBe('Poems of Poe — The Raven · Annabel Lee · Eldorado · The Bells');
    expect(excerpts[0].id).toBe('pg9999-0001');
  });

  it('keeps every line whole, without its indentation, and each poem’s title ahead of it', () => {
    const [excerpt] = verseExcerpts();
    const blocks = excerpt.sourceText.split('\n\n');
    expect(blocks[0]).toBe('The Raven');
    expect(blocks[1].split(LS)).toEqual([
      'Once upon a midnight dreary, while I pondered, weak and weary,',
      'Over many a quaint and curious volume of forgotten lore—',
      'While I nodded, nearly napping, suddenly there came a tapping,',
      'As of some one gently rapping, rapping at my chamber door.',
      '"\'Tis some visitor," I muttered, "tapping at my chamber door—',
      'Only this and nothing more."',
    ]);
    expect(blocks).toContain('Eldorado');
    expect(excerpt.sourceText).not.toMatch(/^ +\S/m);
    expect(excerpt.sourceText).not.toContain('\n   ');
  });

  it('shows its lines as lines: the word that begins a line is marked, the first of a stanza is not', () => {
    const [excerpt] = verseExcerpts();
    const tokens = tokenize(excerpt.id, excerpt.sourceText);
    const startsLine = (text: string) => tokens.find(t => t.text === text)?.lineStart === true;
    expect(startsLine('Over')).toBe(true);
    expect(startsLine('While')).toBe(true);
    expect(startsLine('Once')).toBe(false);
    expect(startsLine('Hear')).toBe(false); // the first line of a stanza
    expect(tokens.filter(t => t.isSelectable).map(t => t.text).slice(0, 3)).toEqual(['The', 'Raven', 'Once']);
  });

  it('has the same words, in the same order, as the poems read straight through', () => {
    const [excerpt] = verseExcerpts();
    const body = VERSE_FILE.slice(VERSE_FILE.indexOf('THE RAVEN'), VERSE_FILE.indexOf('*** END'));
    const original = body.split(/\s+/).filter(Boolean).map((w: string) => w.toLowerCase());
    const cut = excerpt.sourceText.split(/\s+/).filter(Boolean).map((w: string) => w.toLowerCase());
    expect(cut).toEqual(original);
  });
});

describe('the form of a book', () => {
  it('is stored with the book: verse where it was said, prose otherwise', async () => {
    const forms = (await db.query<{ id: string; form: string }>('select id, form from books order by id')).rows;
    expect(forms).toEqual([{ id: 'pg174', form: 'prose' }, { id: 'pg9999', form: 'verse' }]);
  });

  it('is sent by the server, and read by the browser, for a book and for a list of books', async () => {
    expect((await repo.getBook('pg9999'))?.form).toBe('verse');
    expect((await repo.getBook('pg174'))?.form).toBe('prose');
    expect((await repo.listBooks()).items.map(b => [b.id, b.form])).toEqual([['pg174', 'prose'], ['pg9999', 'verse']]);
  });

  it('keeps the lines of an excerpt of verse as the server gives them', async () => {
    const passage = await repo.getPassage('pg9999-0001');
    expect(passage?.sourceText).toContain(LS);
    expect(passage?.tokens.some(t => t.lineStart)).toBe(true);
    expect((await repo.getPassage('pg174-0001'))?.tokens.some(t => 'lineStart' in t)).toBe(false);
    expect(excerptsOf('dorianGray')[0].sourceText).not.toContain(LS);
  });

  it('is refused by the list when it is neither prose nor verse', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'palimpsest-form-')), 'list.json');
    writeFileSync(path, JSON.stringify([{ gutenbergId: 1, title: 'T', author: 'A', year: 1900, form: 'poetry' }]));
    expect(() => readList(path)).toThrow(/form \(prose or verse\)/);
    writeFileSync(path, JSON.stringify([{ gutenbergId: 1, title: 'T', author: 'A', year: 1900, form: 'verse' }, { gutenbergId: 2, title: 'U', author: 'A', year: 1900 }]));
    expect(readList(path)).toHaveLength(2);
  });

  it('is only prose or verse in what the server sends: anything else is the server failing', async () => {
    const odd = new HttpBookRepository({ fetch: (async () => new Response(JSON.stringify({ id: 'x', title: 't', author: 'a', year: 1, attribution: { title: 't', author: 'a', year: 1, source: 's', url: 'u', licenseNote: 'l' }, form: 'epic' }))) as typeof fetch });
    await expect(odd.getBook('x')).rejects.toThrow();
  });

  it('is the VERSE_BOOK of the fixture, listed as verse', () => {
    expect(VERSE_BOOK.form).toBe('verse');
    expect(saveBook).toBeTypeOf('function');
  });
});
