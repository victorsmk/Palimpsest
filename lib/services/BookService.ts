import type { BookRepository } from '@/lib/repositories';
import type { Book, Passage } from '@/lib/models';

export class BookService {
  private repo: BookRepository;

  constructor(repo: BookRepository) {
    this.repo = repo;
  }

  listBooks(): Promise<Book[]> {
    return this.repo.listBooks();
  }

  getPassage(id: string): Promise<Passage | null> {
    return this.repo.getPassage(id);
  }

  /** Every passage in the library, grouped by book in the repository's order. */
  async listPassages(): Promise<Passage[]> {
    const books = await this.repo.listBooks();
    const perBook = await Promise.all(books.map(book => this.repo.listPassages(book.id)));
    return perBook.flat();
  }
}
