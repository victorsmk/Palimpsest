import { PoemExistsError, PoemGoneError, PoemLimitError, RepositoryError, UnavailableError } from '@/lib/models';
import { USER_TEXT_LIMITS, type UserText, type UserTextInput } from '@/lib/userTexts/UserTexts';
import type { Db } from './db';

interface Row {
  id: string;
  title: string;
  author: string;
  form: UserText['form'];
  text: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, title, author, form, text, created_at, updated_at';

const textOf = (row: Row): UserText => ({
  id: row.id,
  title: row.title,
  author: row.author,
  form: row.form,
  text: row.text,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const TOO_MANY = `Your account can keep up to ${USER_TEXT_LIMITS.count} texts. Delete one to add another.`;
const TOO_MUCH = 'That would take more room than your account keeps for your texts. Delete one of them, or add a shorter one.';

/**
 * One user's own texts in Postgres (the table in db/schema.sql). Every statement is limited to that user's id, so
 * there is no way to reach another user's texts through it. The limits (how many texts, how much text in all) are
 * applied here, in the same transaction as the write and with one writer at a time per user, whoever is asking.
 * A failure of the database itself is an UnavailableError; what was refused on purpose keeps its own words.
 */
export class PostgresTextRepository {
  constructor(
    private db: Db,
    private userId: string,
    private now: () => Date = () => new Date(),
  ) {}

  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      throw new UnavailableError({ cause: error });
    }
  }

  /** Checks that `adding` bytes of text fit beside the other texts, and (for a new one) that there is a place for it. */
  private async assertRoom(tx: Db, adding: number, replacing: string | null): Promise<void> {
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [this.userId]);
    const { rows } = await tx.query<{ n: number; bytes: string | number | null }>(
      'select count(*)::int as n, coalesce(sum(octet_length(text)), 0) as bytes from user_texts where user_id = $1 and id is distinct from $2',
      [this.userId, replacing],
    );
    if (replacing === null && rows[0].n >= USER_TEXT_LIMITS.count) throw new PoemLimitError(TOO_MANY);
    if (Number(rows[0].bytes) + adding > USER_TEXT_LIMITS.serverBytes) throw new PoemLimitError(TOO_MUCH);
  }

  /** All the texts, the one changed last first. There are at most a few dozen, so they are not paged. */
  list(): Promise<UserText[]> {
    return this.run(async () => {
      const { rows } = await this.db.query<Row>(`select ${COLUMNS} from user_texts where user_id = $1 order by updated_ms desc, id`, [this.userId]);
      return rows.map(textOf);
    });
  }

  /**
   * Adds a text with the id the browser made for it. `times` carries the times of a text that is being copied from
   * a browser; otherwise it is made now. A text with that id already there is a PoemExistsError (adding is never a replacement).
   */
  create(id: string, input: UserTextInput, times?: { createdAt: string; updatedAt: string }): Promise<UserText> {
    return this.run(() =>
      this.db.transaction(async tx => {
        await this.assertRoom(tx, Buffer.byteLength(input.text, 'utf8'), null);
        const now = this.now();
        const createdAt = times?.createdAt ?? now.toISOString();
        const updatedAt = times?.updatedAt ?? createdAt;
        const { rows } = await tx.query<Row>(
          `insert into user_texts (user_id, id, title, author, form, text, created_at, updated_at, updated_ms)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (user_id, id) do nothing
           returning ${COLUMNS}`,
          [this.userId, id, input.title, input.author, input.form, input.text, createdAt, updatedAt, Date.parse(updatedAt) || now.getTime()],
        );
        if (rows.length === 0) throw new PoemExistsError();
        return textOf(rows[0]);
      }),
    );
  }

  /** Replaces the words, title, author and form of a text, keeping the time it was made. A text that is not there is a PoemGoneError. */
  update(id: string, input: UserTextInput): Promise<UserText> {
    return this.run(() =>
      this.db.transaction(async tx => {
        await this.assertRoom(tx, Buffer.byteLength(input.text, 'utf8'), id);
        const now = this.now();
        const { rows } = await tx.query<Row>(
          `update user_texts set title = $3, author = $4, form = $5, text = $6, updated_at = $7, updated_ms = $8
           where user_id = $1 and id = $2
           returning ${COLUMNS}`,
          [this.userId, id, input.title, input.author, input.form, input.text, now.toISOString(), now.getTime()],
        );
        if (rows.length === 0) throw new PoemGoneError();
        return textOf(rows[0]);
      }),
    );
  }

  /** Deletes a text; one that is not there is not an error. */
  delete(id: string): Promise<void> {
    return this.run(async () => {
      await this.db.query('delete from user_texts where user_id = $1 and id = $2', [this.userId, id]);
    });
  }
}
