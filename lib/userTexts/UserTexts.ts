import type { BookRepository } from '@/lib/repositories';
import type { Attribution, Book, Page, PageRequest, Passage, PassageSummary } from '@/lib/models';
import { fold, searchTerms } from '@/lib/library/fold';
import { tokenize } from '@/lib/tokenizer';
import { pageOf } from '@/lib/repositories/paging';
import { isUserId } from './id';
import { countWords, cutUserText, LINE_SEPARATOR, normalizeText, type TextForm } from './cut';

/**
 * Texts the reader has added: kept in this browser only, cut into excerpts like the library's books, and read through
 * the same repository interface, so that every page treats an excerpt of one as it treats any other passage.
 */

export const USER_TEXT_LIMITS = {
  title: 120,
  author: 80,
  /** Characters in one text: a very long novel is about a million; storage in a browser is about five million in all. */
  text: 600_000,
  total: 2_000_000,
  count: 30,
} as const;

export interface UserText {
  id: string;
  title: string;
  author: string;
  form: TextForm;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserTextInput {
  title: string;
  author: string;
  form: TextForm;
  text: string;
}

export type UserTextErrorCode = 'invalid' | 'too-long' | 'too-many' | 'storage-full' | 'unreadable' | 'not-found';

/** A refusal with a message for the reader. */
export class UserTextError extends Error {
  constructor(
    readonly code: UserTextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserTextError';
  }
}

export interface TextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class MemoryTextStorage implements TextStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

export { isUserId };

export const USER_TEXTS_KEY = 'palimpsest:user-texts:v1';

interface Excerpt {
  id: string;
  title: string;
  description: string;
  sourceText: string;
  wordCount: number;
}

/** A small hash of a text, in letters and digits: the part of an excerpt's id that follows what is in it. */
function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** The first words of an excerpt, for the list of excerpts. */
function describe(sourceText: string): string {
  const words = sourceText.split(/\s+/).filter(Boolean);
  return words.slice(0, 10).join(' ').replace(new RegExp(LINE_SEPARATOR, 'g'), ' ') + (words.length > 10 ? '…' : '');
}

/**
 * The excerpts of a text, with the ids they have. An id follows what an excerpt says, not where it is in the text,
 * so editing a text changes the ids of the excerpts that changed and no others: a poem made from an excerpt that
 * was left alone is still there. (Two excerpts that say the same thing are told apart by a number.)
 */
export function excerptsOf(text: Pick<UserText, 'id' | 'title' | 'form' | 'text'>): Excerpt[] {
  const sources = cutUserText(text.text, text.form);
  const seen = new Map<string, number>();
  return sources.map((sourceText, index) => {
    const base = `${text.id}-${hashOf(sourceText)}`;
    const times = (seen.get(base) ?? 0) + 1;
    seen.set(base, times);
    return {
      id: times === 1 ? base : `${base}-${times}`,
      title: sources.length === 1 ? text.title : `${text.title} — Part ${index + 1} of ${sources.length}`,
      description: describe(sourceText),
      sourceText,
      wordCount: countWords(sourceText),
    };
  });
}

function randomId(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `my-${Array.from(bytes, byte => letters[byte % letters.length]).join('')}`;
}

const attributionOf = (text: UserText): Attribution => ({
  title: text.title,
  author: text.author || 'Unknown author',
  year: new Date(text.createdAt).getFullYear() || new Date().getFullYear(),
  source: 'Your own text',
  url: '',
  licenseNote: 'Added by the reader. Whether it may be shared is for them to say.',
});

const bookOf = (text: UserText): Book => ({
  id: text.id,
  title: text.title,
  author: text.author || 'Unknown author',
  year: attributionOf(text).year,
  attribution: attributionOf(text),
  form: text.form,
});

/** What a reader types into a form, checked, with the text normalized. Throws a UserTextError saying what is wrong. */
export function checkInput(input: UserTextInput): UserTextInput {
  const title = input.title.trim().replace(/\s+/g, ' ');
  const author = input.author.trim().replace(/\s+/g, ' ');
  const text = normalizeText(input.text);
  if (title === '') throw new UserTextError('invalid', 'Give the text a title.');
  if (title.length > USER_TEXT_LIMITS.title) throw new UserTextError('invalid', `The title can have at most ${USER_TEXT_LIMITS.title} characters.`);
  if (author.length > USER_TEXT_LIMITS.author) throw new UserTextError('invalid', `The author can have at most ${USER_TEXT_LIMITS.author} characters.`);
  if (text === '') throw new UserTextError('invalid', 'There is no text yet.');
  if (text.length > USER_TEXT_LIMITS.text) {
    throw new UserTextError('too-long', `That text is too long: the most is about ${Math.round(USER_TEXT_LIMITS.text / 6).toLocaleString('en')} words, and it has ${countWords(text).toLocaleString('en')}. Add it in parts.`);
  }
  if (input.form !== 'prose' && input.form !== 'verse') throw new UserTextError('invalid', 'The text is prose or verse.');
  return { title, author, form: input.form, text };
}

export class UserTexts implements BookRepository {
  private cache = new Map<string, Excerpt[]>();

  constructor(
    private storage: TextStorage,
    private now: () => Date = () => new Date(),
  ) {}

  // ── The texts ──────────────────────────────────────────────────────────────────────────────────────────

  private read(): UserText[] {
    const raw = this.storage.getItem(USER_TEXTS_KEY);
    if (!raw) return [];
    try {
      const data: unknown = JSON.parse(raw);
      const texts = (data as { texts?: unknown } | null)?.texts;
      if (!Array.isArray(texts)) return [];
      return texts.filter(
        (t): t is UserText =>
          typeof t === 'object' && t !== null && isUserId((t as UserText).id) && typeof (t as UserText).title === 'string' && typeof (t as UserText).text === 'string' &&
          typeof (t as UserText).author === 'string' && ((t as UserText).form === 'prose' || (t as UserText).form === 'verse') && typeof (t as UserText).createdAt === 'string' && typeof (t as UserText).updatedAt === 'string',
      );
    } catch {
      return [];
    }
  }

  /** Whether what is stored can be read: if not, nothing is written over it. */
  private assertReadable() {
    const raw = this.storage.getItem(USER_TEXTS_KEY);
    if (!raw) return;
    try {
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray((data as { texts?: unknown } | null)?.texts)) throw new Error('shape');
    } catch {
      throw new UserTextError('unreadable', 'The texts kept in this browser cannot be read, so nothing was changed. Clear them in the browser’s site settings to start again.');
    }
  }

  private write(texts: UserText[]) {
    this.assertReadable();
    try {
      this.storage.setItem(USER_TEXTS_KEY, JSON.stringify({ version: 1, texts }));
    } catch {
      throw new UserTextError('storage-full', 'This browser has no room left to keep that text. Delete one of your texts, or add a shorter one.');
    }
  }

  /** The reader's texts, the one changed last first. */
  list(): UserText[] {
    return this.read().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1));
  }

  get(id: string): UserText | null {
    return this.read().find(text => text.id === id) ?? null;
  }

  add(input: UserTextInput): UserText {
    const checked = checkInput(input);
    const texts = this.read();
    if (texts.length >= USER_TEXT_LIMITS.count) throw new UserTextError('too-many', `Up to ${USER_TEXT_LIMITS.count} texts can be kept. Delete one to add another.`);
    this.assertRoom(texts, checked.text.length);
    let id = randomId();
    while (texts.some(text => text.id === id)) id = randomId();
    const time = this.now().toISOString();
    const text: UserText = { id, ...checked, createdAt: time, updatedAt: time };
    this.write([...texts, text]);
    return text;
  }

  update(id: string, input: UserTextInput): UserText {
    const checked = checkInput(input);
    const texts = this.read();
    const old = texts.find(text => text.id === id);
    if (!old) throw new UserTextError('not-found', 'That text is not kept in this browser any more.');
    this.assertRoom(texts.filter(text => text.id !== id), checked.text.length);
    const text: UserText = { ...old, ...checked, updatedAt: this.now().toISOString() };
    this.write(texts.map(t => (t.id === id ? text : t)));
    return text;
  }

  remove(id: string): void {
    const texts = this.read();
    if (!texts.some(text => text.id === id)) return;
    this.write(texts.filter(text => text.id !== id));
  }

  private assertRoom(others: UserText[], adding: number) {
    const total = others.reduce((sum, text) => sum + text.text.length, 0) + adding;
    if (total > USER_TEXT_LIMITS.total) {
      throw new UserTextError('storage-full', 'That would take more room than this browser can keep for your texts. Delete one of them, or add a shorter one.');
    }
  }

  // ── The same texts as a library of books (read-only) ────────────────────────────────────────────────

  private excerpts(text: UserText): Excerpt[] {
    const key = `${text.id}|${text.updatedAt}`;
    let found = this.cache.get(key);
    if (!found) {
      found = excerptsOf(text);
      this.cache.set(key, found);
    }
    return found;
  }

  async listBooks(request?: PageRequest & { search?: string }): Promise<Page<Book>> {
    const terms = searchTerms(request?.search ?? '');
    const books = this.list()
      .map(bookOf)
      .filter(book => {
        const haystack = fold(`${book.title} ${book.author}`);
        return terms.every(term => haystack.includes(term));
      });
    return pageOf(books, book => book.id, request);
  }

  async getBook(id: string): Promise<Book | null> {
    const text = this.get(id);
    return text ? bookOf(text) : null;
  }

  async getPassage(id: string): Promise<Passage | null> {
    if (!isUserId(id)) return null;
    const text = this.get(id.split('-').slice(0, 2).join('-'));
    if (!text) return null;
    const excerpts = this.excerpts(text);
    const index = excerpts.findIndex(excerpt => excerpt.id === id);
    if (index < 0) return null;
    const excerpt = excerpts[index];
    return {
      id: excerpt.id,
      bookId: text.id,
      title: excerpt.title,
      description: excerpt.description,
      sourceText: excerpt.sourceText,
      tokens: tokenize(excerpt.id, excerpt.sourceText),
      attribution: attributionOf(text),
      position: {
        ordinal: index + 1,
        count: excerpts.length,
        previousId: excerpts[index - 1]?.id ?? null,
        nextId: excerpts[index + 1]?.id ?? null,
      },
    };
  }

  async listPassageSummaries(request?: PageRequest & { bookId?: string }): Promise<Page<PassageSummary>> {
    const texts = request?.bookId === undefined ? this.list() : this.list().filter(text => text.id === request.bookId);
    const summaries: PassageSummary[] = texts.flatMap(text =>
      this.excerpts(text).map(excerpt => ({
        id: excerpt.id,
        bookId: text.id,
        title: excerpt.title,
        description: excerpt.description,
        attribution: attributionOf(text),
        wordCount: excerpt.wordCount,
      })),
    );
    return pageOf(summaries, summary => summary.id, request);
  }
}
