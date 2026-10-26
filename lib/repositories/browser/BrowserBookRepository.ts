import type { BookRepository } from '@/lib/repositories';
import { summaryOf, type Book, type Page, type PageRequest, type Passage, type PassageSummary } from '@/lib/models';
import { pageOf } from '../paging';

export class BrowserBookRepository implements BookRepository {
  private passagesMap: Map<string, Passage> = new Map();
  private booksMap: Map<string, Book> = new Map();

  constructor(passages: Passage[] = []) {
    for (const passage of passages) {
      this.passagesMap.set(passage.id, passage);
      if (!this.booksMap.has(passage.bookId)) {
        this.booksMap.set(passage.bookId, {
          id: passage.bookId,
          title: passage.attribution.title,
          author: passage.attribution.author,
          year: passage.attribution.year,
          attribution: passage.attribution,
        });
      }
    }
  }

  async listBooks(page?: PageRequest): Promise<Page<Book>> {
    return pageOf(Array.from(this.booksMap.values()), book => book.id, page);
  }

  async getBook(id: string): Promise<Book | null> {
    return this.booksMap.get(id) ?? null;
  }

  async getPassage(id: string): Promise<Passage | null> {
    return this.passagesMap.get(id) ?? null;
  }

  async listPassageSummaries(request?: PageRequest & { bookId?: string }): Promise<Page<PassageSummary>> {
    const all = Array.from(this.passagesMap.values()).filter(p => request?.bookId === undefined || p.bookId === request.bookId);
    const page = pageOf(all, p => p.id, request);
    return { items: page.items.map(summaryOf), next: page.next };
  }
}
