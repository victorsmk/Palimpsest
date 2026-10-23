import type { BookRepository } from '@/lib/repositories';
import type { Book, Passage } from '@/lib/models';

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

  async listBooks(): Promise<Book[]> {
    return Array.from(this.booksMap.values());
  }

  async getBook(id: string): Promise<Book | null> {
    return this.booksMap.get(id) ?? null;
  }

  async getPassage(id: string): Promise<Passage | null> {
    return this.passagesMap.get(id) ?? null;
  }

  async listPassages(bookId: string): Promise<Passage[]> {
    return Array.from(this.passagesMap.values()).filter(p => p.bookId === bookId);
  }
}
