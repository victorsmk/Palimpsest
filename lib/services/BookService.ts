import type { BookRepository } from '@/lib/repositories';
import type { Book, Page, PageRequest, Passage, PassageSummary } from '@/lib/models';
import { PassageLibrary } from '@/lib/library/passageLibrary';
import { isUserId } from '@/lib/userTexts/id';

/** Every item of a paged list, by asking for page after page. */
async function allPages<T>(fetch: (request: PageRequest) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  do {
    const page = await fetch({ after });
    items.push(...page.items);
    after = page.next ?? undefined;
  } while (after !== undefined);
  return items;
}

export class BookService {
  private repo: BookRepository;
  /** The library of books on the server, when there is one: found by search, and read an excerpt at a time. */
  private remote: BookRepository | null;
  private library: Promise<PassageLibrary> | null = null;

  /** The texts the reader added, kept in this browser. */
  private own: BookRepository | null;

  constructor(repo: BookRepository, remote: BookRepository | null = null, own: BookRepository | null = null) {
    this.repo = repo;
    this.remote = remote;
    this.own = own;
  }

  /** The reader's own texts as books, the one changed last first; with `search`, only those with every word in the title or author. */
  listOwnBooks(request?: PageRequest & { search?: string }): Promise<Page<Book>> {
    if (!this.own) return Promise.resolve({ items: [], next: null });
    // The texts are a bonus in a list of books: if the account cannot be reached for them, the library is still there to choose from.
    return this.own.listBooks(request).catch(error => {
      console.warn('The reader’s own texts could not be listed:', error);
      return { items: [], next: null };
    });
  }

  /** Whether there is a library of books beyond the ones bundled with the app. */
  get hasRemoteLibrary(): boolean {
    return this.remote !== null;
  }

  /** A page of the server's books, by title, optionally only those matching a search. Empty without a server library. */
  searchBooks(request?: PageRequest & { search?: string }): Promise<Page<Book>> {
    return this.remote ? this.remote.listBooks(request) : Promise.resolve({ items: [], next: null });
  }

  /** A book of the server's library, or one of the reader's own texts. */
  getRemoteBook(id: string): Promise<Book | null> {
    if (isUserId(id)) return this.own ? this.own.getBook(id) : Promise.resolve(null);
    return this.remote ? this.remote.getBook(id) : Promise.resolve(null);
  }

  /** A page of one book's excerpts, without their text. */
  listBookPassages(bookId: string, request?: PageRequest): Promise<Page<PassageSummary>> {
    if (isUserId(bookId)) return this.own ? this.own.listPassageSummaries({ ...request, bookId }) : Promise.resolve({ items: [], next: null });
    return this.remote ? this.remote.listPassageSummaries({ ...request, bookId }) : Promise.resolve({ items: [], next: null });
  }

  /** An excerpt chosen at random from the server's library, in full; null without a library, or if it has no books. */
  async surprise(): Promise<Passage | null> {
    const id = this.remote?.randomPassageId ? await this.remote.randomPassageId() : null;
    return id ? this.getPassage(id) : null;
  }

  listBooks(): Promise<Book[]> {
    return allPages(page => this.repo.listBooks(page));
  }

  /** One passage in full: one bundled with the app, or else one of the server's library. */
  async getPassage(id: string): Promise<Passage | null> {
    if (isUserId(id)) return this.own ? this.own.getPassage(id) : null;
    return (await this.repo.getPassage(id)) ?? (this.remote ? this.remote.getPassage(id) : null);
  }

  /** Every passage's summary, in the library's order. */
  listPassageSummaries(): Promise<PassageSummary[]> {
    return allPages(page => this.repo.listPassageSummaries(page));
  }

  /**
   * The library as a screen uses it: all the summaries now, each passage's text when asked for. One
   * library is shared by every screen, so a passage one screen has loaded is there for the next. If
   * the summaries cannot be listed, the next call tries again.
   */
  openLibrary(): Promise<PassageLibrary> {
    if (!this.library) {
      const opening = this.listPassageSummaries().then(summaries => new PassageLibrary(summaries, id => this.getPassage(id), { openEnded: this.remote !== null }));
      this.library = opening;
      opening.catch(() => {
        if (this.library === opening) this.library = null;
      });
    }
    return this.library;
  }
}
