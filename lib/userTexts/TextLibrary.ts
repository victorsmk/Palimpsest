import type { BookRepository } from '@/lib/repositories';
import type { HttpTextRepository } from '@/lib/repositories/http/HttpTextRepository';
import { PoemExistsError, PoemGoneError, PoemLimitError, RepositoryError, UnauthorizedError, type Book, type Page, type PageRequest, type Passage, type PassageSummary } from '@/lib/models';
import {
  TextsAsBooks,
  UserTextError,
  checkInput,
  newTextId,
  type TextStorage,
  type UserText,
  type UserTextInput,
  type UserTexts,
} from './UserTexts';

/** Where the reader's texts are kept right now: in their account when they are signed in (and the app has accounts), otherwise in this browser. */
export type TextsWhere = 'account' | 'browser';

/** What happened when the texts of this browser were copied to an account, to be told to the reader once. */
export interface CopyReport {
  copied: number;
  /** Titles of texts that could not be copied, because the account had no room for them. */
  skipped: string[];
}

export interface TextLibraryOptions {
  /** The texts of this browser. */
  local: UserTexts;
  /** The texts in an account, when the app has accounts. */
  remote: HttpTextRepository | null;
  /** The id of whoever is signed in, or null; it waits for the sign-in service to answer. */
  whoIsSignedIn: () => Promise<string | null>;
  /** Where to remember what has been copied to an account (this browser's storage). */
  storage: TextStorage;
  /** How long a list fetched from the account is trusted, in milliseconds. */
  listMs?: number;
  now?: () => number;
}

const HANDLED_KEY = (userId: string) => `palimpsest:user-texts:copied:v1:${userId}`;
const REPORT_KEY = (userId: string) => `palimpsest:user-texts:copy-report:v1:${userId}`;

/** What a reader is told when a text could not be kept in the account, from the error the server's repository gives. */
function asTextError(error: unknown): unknown {
  if (error instanceof UserTextError) return error;
  if (error instanceof PoemLimitError) return new UserTextError('storage-full', error.message);
  if (error instanceof PoemGoneError) return new UserTextError('not-found', 'This text was deleted somewhere else, so the change was not saved.');
  if (error instanceof UnauthorizedError) return new UserTextError('unavailable', 'You are not signed in, so the text was not saved to your account. Sign in again to keep it.');
  if (error instanceof RepositoryError) return new UserTextError('unavailable', `${error.message}${error.retryable ? ' Please try again.' : ''}`);
  return error;
}

/**
 * The reader's own texts, wherever they are kept: in this browser when nobody is signed in, in their account when
 * they are (so that they follow the reader to any browser). Reading them as books and changing them both go
 * through here. The first time a signed-in reader's texts are asked for, the texts this browser holds are copied
 * to the account, once each: a text deleted from the account does not come back from this browser's copy, and
 * a text added here while signed out is copied the next time they sign in. This browser's copies stay as they are.
 */
export class TextLibrary implements BookRepository {
  private books = new TextsAsBooks({ list: () => this.list(), get: id => this.get(id) });
  private cache: { userId: string; at: number; texts: UserText[] } | null = null;
  private copying = new Map<string, Promise<void>>();
  private listMs: number;
  private now: () => number;

  constructor(private options: TextLibraryOptions) {
    this.listMs = options.listMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  /** The account texts go to, or null for this browser. */
  private async account(): Promise<{ userId: string; remote: HttpTextRepository } | null> {
    const remote = this.options.remote;
    if (!remote) return null;
    const userId = await this.options.whoIsSignedIn();
    return userId ? { userId, remote } : null;
  }

  async where(): Promise<TextsWhere> {
    return (await this.account()) ? 'account' : 'browser';
  }

  // ── Copying this browser's texts to an account ─────────────────────────────────────────────────────────

  private handled(userId: string): Set<string> {
    try {
      const raw = this.options.storage.getItem(HANDLED_KEY(userId));
      const list: unknown = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private async copyLocalTexts(userId: string, remote: HttpTextRepository): Promise<void> {
    const handled = this.handled(userId);
    const waiting = this.options.local.list().filter(text => !handled.has(text.id));
    if (waiting.length === 0) return;
    const report: CopyReport = { copied: 0, skipped: [] };
    try {
      for (const text of waiting) {
        try {
          await remote.create(text.id, { title: text.title, author: text.author, form: text.form, text: text.text }, { createdAt: text.createdAt, updatedAt: text.updatedAt });
          report.copied++;
        } catch (error) {
          if (error instanceof PoemLimitError) report.skipped.push(text.title);
          // A text with that id is in the account already (copied before, or made there): nothing to do.
          else if (!(error instanceof PoemExistsError)) throw error;
        }
        handled.add(text.id);
      }
    } catch (error) {
      // The account could not be reached (offline, rate limited, signed out): what was copied is remembered, the rest is tried next time.
      console.warn('The texts of this browser could not all be copied to the account yet:', error);
    }
    try {
      this.options.storage.setItem(HANDLED_KEY(userId), JSON.stringify([...handled]));
      if (report.copied > 0 || report.skipped.length > 0) this.options.storage.setItem(REPORT_KEY(userId), JSON.stringify(report));
    } catch {
      /* Storage is full or blocked: they may be copied (and told about) again, which adds nothing twice. */
    }
  }

  /** Once for each signed-in reader on each page load. */
  private ensureCopied(userId: string, remote: HttpTextRepository): Promise<void> {
    let done = this.copying.get(userId);
    if (!done) {
      done = this.copyLocalTexts(userId, remote);
      this.copying.set(userId, done);
    }
    return done;
  }

  /** What was copied to the account and has not been told yet; it is told once. Null when nothing was. */
  async takeCopyReport(): Promise<CopyReport | null> {
    const account = await this.account();
    if (!account) return null;
    try {
      const raw = this.options.storage.getItem(REPORT_KEY(account.userId));
      if (!raw) return null;
      this.options.storage.setItem(REPORT_KEY(account.userId), '');
      const report = JSON.parse(raw) as Partial<CopyReport>;
      if (typeof report.copied !== 'number' || !Array.isArray(report.skipped)) return null;
      return { copied: report.copied, skipped: report.skipped.filter((t): t is string => typeof t === 'string') };
    } catch {
      return null;
    }
  }

  // ── The texts ──────────────────────────────────────────────────────────────────────────────────────────

  /** The reader's texts, the one changed last first. `fresh` asks the account again instead of trusting a list fetched a moment ago. */
  async list(fresh = false): Promise<UserText[]> {
    const account = await this.account();
    if (!account) return this.options.local.list();
    await this.ensureCopied(account.userId, account.remote);
    const cache = this.cache;
    if (!fresh && cache && cache.userId === account.userId && this.now() - cache.at < this.listMs) return cache.texts;
    const texts = await account.remote.list();
    this.cache = { userId: account.userId, at: this.now(), texts };
    return texts;
  }

  async get(id: string): Promise<UserText | null> {
    return (await this.list()).find(text => text.id === id) ?? null;
  }

  async add(input: UserTextInput): Promise<UserText> {
    const account = await this.account();
    if (!account) return this.options.local.add(input);
    try {
      const checked = checkInput(input);
      await this.ensureCopied(account.userId, account.remote);
      for (let attempt = 0; ; attempt++) {
        try {
          return await account.remote.create(newTextId(), checked);
        } catch (error) {
          // An id made by chance that is taken already: make another.
          if (!(error instanceof PoemExistsError) || attempt >= 3) throw error;
        }
      }
    } catch (error) {
      throw asTextError(error);
    } finally {
      this.cache = null;
    }
  }

  async update(id: string, input: UserTextInput): Promise<UserText> {
    const account = await this.account();
    if (!account) return this.options.local.update(id, input);
    try {
      return await account.remote.update(id, checkInput(input));
    } catch (error) {
      throw asTextError(error);
    } finally {
      this.cache = null;
    }
  }

  async remove(id: string): Promise<void> {
    const account = await this.account();
    if (!account) return this.options.local.remove(id);
    try {
      await account.remote.remove(id);
    } catch (error) {
      throw asTextError(error);
    } finally {
      this.cache = null;
    }
  }

  // ── The same texts as a library of books (read-only) ────────────────────────────────────────────────

  listBooks(request?: PageRequest & { search?: string }): Promise<Page<Book>> {
    return this.books.listBooks(request);
  }

  getBook(id: string): Promise<Book | null> {
    return this.books.getBook(id);
  }

  getPassage(id: string): Promise<Passage | null> {
    return this.books.getPassage(id);
  }

  listPassageSummaries(request?: PageRequest & { bookId?: string }): Promise<Page<PassageSummary>> {
    return this.books.listPassageSummaries(request);
  }
}
