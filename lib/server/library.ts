import type { Book, Page, PageRequest, Passage, PassageSummary } from '@/lib/models';
import { FOLD_PAIRS, searchTerms } from '@/lib/library/fold';
import { pageSize } from '@/lib/repositories/paging';
import type { Db } from './db';

/** A passage as the server sends it: the words are made from the text on the other side (see tokenize). */
export type PassageText = Omit<Passage, 'tokens'>;

interface BookRow {
  id: string;
  title: string;
  author: string;
  year: number;
  source: string;
  url: string;
  license_note: string;
}

interface PassageRow extends BookRow {
  pid: string;
  ptitle: string;
  description: string;
  source_text: string;
  word_count: number;
  ordinal: number;
  passage_count: number;
  previous_id: string | null;
  next_id: string | null;
}

const attributionOf = (row: BookRow) => ({ title: row.title, author: row.author, year: Number(row.year), source: row.source, url: row.url, licenseNote: row.license_note });

const bookOf = (row: BookRow): Book => ({ id: row.id, title: row.title, author: row.author, year: Number(row.year), attribution: attributionOf(row) });

/** Where a page of books ended: the title as it is sorted, and the id, which together fix a book's place. */
const encodeCursor = (sortKey: string, id: string) => Buffer.from(JSON.stringify([sortKey, id])).toString('base64url');
function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string' ? [value[0], value[1]] : null;
  } catch {
    return null;
  }
}

/**
 * Reads the library of books. Everything here is public text, the same for everyone, and only ever read.
 * Books are listed by title (ignoring a leading "The", "A" or "An"), and can be searched by the words of
 * their title and author: every word must be somewhere in "title author", ignoring capitals and accents.
 */
export class LibraryReader {
  constructor(private db: Db) {}

  /** The books, a page at a time. A cursor that names nothing readable ends the walk with an empty page. */
  async listBooks(request: PageRequest & { search?: string } = {}): Promise<Page<Book>> {
    const size = pageSize(request);
    const params: unknown[] = [FOLD_PAIRS.from, FOLD_PAIRS.to];
    const where: string[] = [];
    if (request.after !== undefined) {
      const cursor = decodeCursor(request.after);
      if (!cursor) return { items: [], next: null };
      params.push(cursor[0], cursor[1]);
      where.push(`(b.sort_key, b.id) > ($${params.length - 1}::text collate "C", $${params.length}::text collate "C")`);
    }
    for (const term of searchTerms(request.search ?? '')) {
      params.push(term);
      where.push(`strpos(b.folded, $${params.length}) > 0`);
    }
    params.push(size + 1);
    const { rows } = await this.db.query<BookRow & { sort_key: string }>(
      `select b.id, b.title, b.author, b.year, b.source, b.url, b.license_note, b.sort_key
       from (
         select id, title, author, year, source, url, license_note,
                translate(lower(title || ' ' || author), $1, $2) as folded,
                (regexp_replace(translate(lower(title), $1, $2), '^(the|a|an) ', '')) collate "C" as sort_key
         from books
       ) b
       ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
       order by b.sort_key collate "C", b.id collate "C"
       limit $${params.length}`,
      params
    );
    const items = rows.slice(0, size);
    const last = items[items.length - 1];
    return { items: items.map(bookOf), next: rows.length > size && last ? encodeCursor(last.sort_key, last.id) : null };
  }

  async getBook(id: string): Promise<Book | null> {
    const { rows } = await this.db.query<BookRow>('select id, title, author, year, source, url, license_note from books where id = $1', [id]);
    return rows[0] ? bookOf(rows[0]) : null;
  }

  /** The excerpts of one book in their order, a page at a time, without their text. An unknown book has none. */
  async listPassages(bookId: string, request: PageRequest = {}): Promise<Page<PassageSummary & { wordCount: number }>> {
    const size = pageSize(request);
    let after = 0;
    if (request.after !== undefined) {
      if (!/^\d{1,9}$/.test(request.after)) return { items: [], next: null };
      after = Number(request.after);
    }
    const { rows } = await this.db.query<BookRow & { pid: string; ptitle: string; description: string; word_count: number; ordinal: number }>(
      `select b.id, b.title, b.author, b.year, b.source, b.url, b.license_note,
              p.id as pid, p.title as ptitle, p.description, p.word_count, p.ordinal
       from passages p join books b on b.id = p.book_id
       where p.book_id = $1 and p.ordinal > $2
       order by p.ordinal
       limit $3`,
      [bookId, after, size + 1]
    );
    const items = rows.slice(0, size);
    const last = items[items.length - 1];
    return {
      items: items.map(row => ({ id: row.pid, bookId: row.id, title: row.ptitle, description: row.description, attribution: attributionOf(row), wordCount: Number(row.word_count) })),
      next: rows.length > size && last ? String(last.ordinal) : null,
    };
  }

  /** One excerpt with its text, and where it sits in its book, or null if there is none with that id. */
  async getPassage(id: string): Promise<PassageText | null> {
    const { rows } = await this.db.query<PassageRow>(
      `select b.id, b.title, b.author, b.year, b.source, b.url, b.license_note, b.passage_count,
              p.id as pid, p.title as ptitle, p.description, p.source_text, p.word_count, p.ordinal,
              (select q.id from passages q where q.book_id = p.book_id and q.ordinal = p.ordinal - 1) as previous_id,
              (select q.id from passages q where q.book_id = p.book_id and q.ordinal = p.ordinal + 1) as next_id
       from passages p join books b on b.id = p.book_id
       where p.id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.pid,
      bookId: row.id,
      title: row.ptitle,
      description: row.description,
      sourceText: row.source_text,
      attribution: attributionOf(row),
      position: { ordinal: Number(row.ordinal), count: Number(row.passage_count), previousId: row.previous_id, nextId: row.next_id },
    };
  }

  /** Whether the library's tables are there and can be read (for the health page). */
  async check(): Promise<void> {
    await this.db.query('select 1 from books limit 1');
    await this.db.query('select 1 from passages limit 1');
  }
}

