// Puts an imported book and its excerpts into the database. `db` is anything with the two methods the server's
// Db has (query, and transaction), so the tests run it on an in-process Postgres and the script on a real one.
import { CUTTER_VERSION, wordCount } from './cut.mjs';

/** How many excerpts go in one statement. */
const BATCH = 100;

/**
 * Adds a book and all its excerpts, all or none. A book that is already there is left exactly as it is:
 * excerpts are never changed or re-cut after they are imported, because saved poems point at their words.
 * Returns 'added' or 'exists'.
 */
export async function saveBook(db, entry, excerpts) {
  const id = `pg${entry.gutenbergId}`;
  return db.transaction(async tx => {
    const inserted = await tx.query(
      `insert into books (id, gutenberg_id, title, author, year, language, source, url, license_note, passage_count, word_count, cutter_version)
       values ($1, $2, $3, $4, $5, 'en', 'Project Gutenberg', $6, 'Public domain in the USA', $7, $8, $9)
       on conflict do nothing
       returning id`,
      [id, entry.gutenbergId, entry.title, entry.author, entry.year, `https://www.gutenberg.org/ebooks/${entry.gutenbergId}`, excerpts.length, excerpts.reduce((sum, e) => sum + e.wordCount, 0), CUTTER_VERSION]
    );
    if (inserted.rows.length === 0) return 'exists';
    for (let i = 0; i < excerpts.length; i += BATCH) {
      const chunk = excerpts.slice(i, i + BATCH);
      await tx.query(
        `insert into passages (id, book_id, ordinal, title, description, source_text, word_count)
         select * from unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::int[])`,
        [chunk.map(e => e.id), chunk.map(() => id), chunk.map(e => e.ordinal), chunk.map(e => e.title), chunk.map(e => e.description), chunk.map(e => e.sourceText), chunk.map(e => e.wordCount)]
      );
    }
    return 'added';
  });
}

/** The size of the library's tables, for the report (Postgres only). */
export async function libraryBytes(db) {
  const { rows } = await db.query(`select pg_total_relation_size('books') + pg_total_relation_size('passages') as bytes`);
  return Number(rows[0].bytes);
}

export { wordCount };
