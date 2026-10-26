import type { PoemRepository } from '@/lib/repositories';
import {
  LIMITS,
  PoemConflictError,
  PoemExistsError,
  PoemGoneError,
  PoemLimitError,
  RepositoryError,
  UnavailableError,
  previewHeadOf,
  type Page,
  type PageRequest,
  type Poem,
  type PoemDraft,
  type PoemPreviewHead,
  type PoemSummary,
} from '@/lib/models';
import { stampNew, stampUpdate } from '@/lib/models/stamp';
import { pageSize, parsePoemCursor, poemCursor, updatedMs } from '@/lib/repositories/paging';
import type { Db } from './db';

const COLLECTION_FULL = `Your collection is full: it can hold up to ${LIMITS.poemsMax.toLocaleString('en-US')} poems. Delete some to save more.`;

const ALL_COLUMNS =
  'id, schema_version, revision, passage_id, passage_version, title, notes, retained_token_ids, line_breaks, erasure_style, created_at, updated_at';
const SUMMARY_COLUMNS = 'id, passage_id, passage_version, revision, title, erasure_style, word_count, created_at, updated_at, preview';

interface Row {
  id: string;
  schema_version: number;
  revision: number;
  passage_id: string;
  passage_version: string | null;
  title: string | null;
  notes: string | null;
  retained_token_ids: string[];
  line_breaks: string[];
  erasure_style: Poem['erasureStyle'];
  created_at: string;
  updated_at: string;
}

interface SummaryRow {
  id: string;
  passage_id: string;
  passage_version: string | null;
  revision: number;
  title: string | null;
  erasure_style: Poem['erasureStyle'];
  word_count: number;
  created_at: string;
  updated_at: string;
  preview: PoemPreviewHead;
}

function poemOf(row: Row): Poem {
  const poem: Poem = {
    id: row.id,
    schemaVersion: row.schema_version,
    revision: row.revision,
    passageId: row.passage_id,
    retainedTokenIds: row.retained_token_ids,
    lineBreaks: row.line_breaks,
    erasureStyle: row.erasure_style,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.passage_version !== null) poem.passageVersion = row.passage_version;
  if (row.title !== null) poem.title = row.title;
  if (row.notes !== null) poem.notes = row.notes;
  return poem;
}

function summaryOfRow(row: SummaryRow): PoemSummary {
  const summary: PoemSummary = {
    id: row.id,
    passageId: row.passage_id,
    revision: row.revision,
    erasureStyle: row.erasure_style,
    wordCount: row.word_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview: row.preview,
  };
  if (row.passage_version !== null) summary.passageVersion = row.passage_version;
  if (row.title !== null) summary.title = row.title;
  return summary;
}

/**
 * One user's poems in Postgres (the table in db/schema.sql). Every statement is limited to that user's
 * id, so there is no way to reach another user's poems through it. It keeps the whole PoemRepository
 * contract, and adds what only a server can: the collection limit is applied here, in the same
 * transaction as the write, whoever is asking. A failure of the database itself is an
 * UnavailableError; what was refused on purpose keeps its own words.
 */
export class PostgresPoemRepository implements PoemRepository {
  constructor(
    private db: Db,
    private userId: string
  ) {}

  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      throw new UnavailableError({ cause: error });
    }
  }

  /** One writer at a time per user while the limit is checked and the poems are written. */
  private async lockUser(tx: Db): Promise<void> {
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [this.userId]);
  }

  private async assertRoomFor(tx: Db, adding: number): Promise<void> {
    const { rows } = await tx.query<{ n: number }>('select count(*)::int as n from poems where user_id = $1', [this.userId]);
    if (rows[0].n + adding > LIMITS.poemsMax) throw new PoemLimitError(COLLECTION_FULL);
  }

  private async insert(tx: Db, poem: Poem): Promise<void> {
    await tx.query(
      `insert into poems (user_id, id, schema_version, revision, passage_id, passage_version, title, notes,
         retained_token_ids, line_breaks, erasure_style, word_count, preview, created_at, updated_at, updated_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13::jsonb, $14, $15, $16)`,
      [
        this.userId,
        poem.id,
        poem.schemaVersion,
        poem.revision,
        poem.passageId,
        poem.passageVersion ?? null,
        poem.title ?? null,
        poem.notes ?? null,
        JSON.stringify(poem.retainedTokenIds),
        JSON.stringify(poem.lineBreaks),
        poem.erasureStyle,
        poem.retainedTokenIds.length,
        JSON.stringify(previewHeadOf(poem)),
        poem.createdAt,
        poem.updatedAt,
        updatedMs(poem),
      ]
    );
  }

  create(draft: PoemDraft): Promise<Poem> {
    return this.run(() =>
      this.db.transaction(async tx => {
        await this.lockUser(tx);
        await this.assertRoomFor(tx, 1);
        const poem = stampNew(draft);
        await this.insert(tx, poem);
        return poem;
      })
    );
  }

  update(id: string, draft: PoemDraft, expectedRevision: number): Promise<Poem> {
    return this.run(() =>
      this.db.transaction(async tx => {
        const { rows } = await tx.query<Row>(`select ${ALL_COLUMNS} from poems where user_id = $1 and id = $2 for update`, [this.userId, id]);
        if (rows.length === 0) throw new PoemGoneError();
        const current = poemOf(rows[0]);
        if (current.revision !== expectedRevision) throw new PoemConflictError(current);
        const poem = stampUpdate(current, draft);
        await tx.query(
          `update poems set schema_version = $3, revision = $4, passage_id = $5, passage_version = $6, title = $7, notes = $8,
             retained_token_ids = $9::jsonb, line_breaks = $10::jsonb, erasure_style = $11, word_count = $12, preview = $13::jsonb,
             updated_at = $14, updated_ms = $15
           where user_id = $1 and id = $2`,
          [
            this.userId,
            id,
            poem.schemaVersion,
            poem.revision,
            poem.passageId,
            poem.passageVersion ?? null,
            poem.title ?? null,
            poem.notes ?? null,
            JSON.stringify(poem.retainedTokenIds),
            JSON.stringify(poem.lineBreaks),
            poem.erasureStyle,
            poem.retainedTokenIds.length,
            JSON.stringify(previewHeadOf(poem)),
            poem.updatedAt,
            updatedMs(poem),
          ]
        );
        return poem;
      })
    );
  }

  async importMany(poems: Poem[]): Promise<void> {
    // The same refusal as the other repositories: this id is not an ordinary key in some of them.
    if (poems.some(poem => poem.id === '__proto__')) throw new Error('That poem cannot be stored.');
    if (new Set(poems.map(poem => poem.id)).size !== poems.length) throw new PoemExistsError();
    if (poems.length === 0) return;
    await this.run(() =>
      this.db.transaction(async tx => {
        await this.lockUser(tx);
        const taken = await tx.query('select 1 from poems where user_id = $1 and id = any($2::text[]) limit 1', [this.userId, poems.map(poem => poem.id)]);
        if (taken.rows.length > 0) throw new PoemExistsError();
        await this.assertRoomFor(tx, poems.length);
        for (const poem of poems) await this.insert(tx, structuredClone(poem));
      })
    );
  }

  get(id: string): Promise<Poem | null> {
    return this.run(async () => {
      const { rows } = await this.db.query<Row>(`select ${ALL_COLUMNS} from poems where user_id = $1 and id = $2`, [this.userId, id]);
      return rows.length > 0 ? poemOf(rows[0]) : null;
    });
  }

  getMany(ids: string[]): Promise<Poem[]> {
    return this.run(async () => {
      const wanted = [...new Set(ids)];
      if (wanted.length === 0) return [];
      const { rows } = await this.db.query<Row>(`select ${ALL_COLUMNS} from poems where user_id = $1 and id = any($2::text[])`, [this.userId, wanted]);
      const byId = new Map(rows.map(row => [row.id, poemOf(row)]));
      return wanted.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
    });
  }

  count(): Promise<number> {
    return this.run(async () => {
      const { rows } = await this.db.query<{ n: number }>('select count(*)::int as n from poems where user_id = $1', [this.userId]);
      return rows[0].n;
    });
  }

  /** A page of rows in list order, with the cursor for the page after it. */
  private async page<R extends { id: string; updated_at: string }>(columns: string, page: PageRequest | undefined): Promise<Page<R>> {
    const size = pageSize(page);
    const params: unknown[] = [this.userId];
    let after = '';
    if (page?.after !== undefined) {
      const position = parsePoemCursor(page.after);
      if (!position) return { items: [], next: null };
      params.push(updatedMs(position), position.id);
      after = 'and (updated_ms < $2 or (updated_ms = $2 and id > $3))';
    }
    params.push(size + 1);
    const { rows } = await this.db.query<R>(
      `select ${columns} from poems where user_id = $1 ${after} order by updated_ms desc, id asc limit $${params.length}`,
      params
    );
    const items = rows.slice(0, size);
    return { items, next: rows.length > size ? poemCursor({ id: items[size - 1].id, updatedAt: items[size - 1].updated_at }) : null };
  }

  listSummaries(page?: PageRequest): Promise<Page<PoemSummary>> {
    return this.run(async () => {
      const { items, next } = await this.page<SummaryRow>(SUMMARY_COLUMNS, page);
      return { items: items.map(summaryOfRow), next };
    });
  }

  list(page?: PageRequest): Promise<Page<Poem>> {
    return this.run(async () => {
      const { items, next } = await this.page<Row>(ALL_COLUMNS, page);
      return { items: items.map(poemOf), next };
    });
  }

  delete(id: string): Promise<void> {
    return this.run(async () => {
      await this.db.query('delete from poems where user_id = $1 and id = $2', [this.userId, id]);
    });
  }
}
