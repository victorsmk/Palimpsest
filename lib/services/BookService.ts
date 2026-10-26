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
  private library: Promise<PassageLibrary> | null = null;

  constructor(repo: BookRepository) {
    this.repo = repo;
  }

  listBooks(): Promise<Book[]> {
    return allPages(page => this.repo.listBooks(page));
  }

  /** One passage in full. */
  getPassage(id: string): Promise<Passage | null> {
    return this.repo.getPassage(id);
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
      const opening = this.listPassageSummaries().then(summaries => new PassageLibrary(summaries, id => this.repo.getPassage(id)));
      this.library = opening;
      opening.catch(() => {
        if (this.library === opening) this.library = null;
      });
    }
    return this.library;
  }
}
