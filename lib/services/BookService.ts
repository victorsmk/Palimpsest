import type { BookRepository } from '@/lib/repositories';
import type { Book, Page, PageRequest, Passage, PassageSummary } from '@/lib/models';
import { PassageLibrary } from '@/lib/library/passageLibrary';

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

  constructor(repo: BookRepository, remote: BookRepository | null = null) {
    this.repo = repo;
    this.remote = remote;
  }

  /** Whether there is a library of books beyond the ones bundled with the app. */
  get hasRemoteLibrary(): boolean {
    return this.remote !== null;
  }

  /** A page of the server's books, by title, optionally only those matching a search. Empty without a server library. */
  searchBooks(request?: PageRequest & { search?: string }): Promise<Page<Book>> {
    return this.remote ? this.remote.listBooks(request) : Promise.resolve({ items: [], next: null });
  }

  getRemoteBook(id: string): Promise<Book | null> {
    return this.remote ? this.remote.getBook(id) : Promise.resolve(null);
  }

  /** A page of one book's excerpts, without their text. */
  listBookPassages(bookId: string, request?: PageRequest): Promise<Page<PassageSummary>> {
    return this.remote ? this.remote.listPassageSummaries({ ...request, bookId }) : Promise.resolve({ items: [], next: null });
  }

  listBooks(): Promise<Book[]> {
    return allPages(page => this.repo.listBooks(page));
  }

  /** One passage in full: one bundled with the app, or else one of the server's library. */
  async getPassage(id: string): Promise<Passage | null> {
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
