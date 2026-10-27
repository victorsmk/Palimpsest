import type { PoemsApi } from '@/lib/server/api/handlers';
import type { LibraryApi } from '@/lib/server/api/library';
import type { TextsApi } from '@/lib/server/api/texts';

/**
 * A `fetch` that answers from the poems API in the same process, the way the Next server would: it picks
 * the handler by method and path, and hands a dynamic segment over decoded (Next does that too). The
 * browser's repository can then be run against the real handlers without a web server.
 */
export function inProcessFetch(api: PoemsApi, library?: LibraryApi, texts?: TextsApi): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), 'http://localhost'), init);
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === '/api/poems') {
      if (method === 'GET') return api.list(request);
      if (method === 'POST') return api.create(request);
    }
    const one = /^\/api\/poems\/([^/]+)$/.exec(pathname);
    if (one) {
      const id = decodeURIComponent(one[1]);
      if (method === 'GET') return api.get(request, id);
      if (method === 'PUT') return api.update(request, id);
      if (method === 'DELETE') return api.remove(request, id);
    }
    if (pathname === '/api/account' && method === 'DELETE') return api.deleteAccount(request);
    if (pathname === '/api/collection/count' && method === 'GET') return api.count(request);
    if (pathname === '/api/collection/lookup' && method === 'POST') return api.lookup(request);
    if (pathname === '/api/collection/import' && method === 'POST') return api.importPoems(request);
    if (texts) {
      if (pathname === '/api/texts') {
        if (method === 'GET') return texts.list(request);
        if (method === 'POST') return texts.create(request);
      }
      const text = /^\/api\/texts\/([^/]+)$/.exec(pathname);
      if (text) {
        const id = decodeURIComponent(text[1]);
        if (method === 'PUT') return texts.update(request, id);
        if (method === 'DELETE') return texts.remove(request, id);
      }
    }
    if (library && method === 'GET') {
      if (pathname === '/api/library/random') return library.random();
      if (pathname === '/api/library/books') return library.books(request);
      const book = /^\/api\/library\/books\/([^/]+)$/.exec(pathname);
      if (book) return library.book(request, decodeURIComponent(book[1]));
      const bookPassages = /^\/api\/library\/books\/([^/]+)\/passages$/.exec(pathname);
      if (bookPassages) return library.bookPassages(request, decodeURIComponent(bookPassages[1]));
      const passage = /^\/api\/library\/passages\/([^/]+)$/.exec(pathname);
      if (passage) return library.passage(request, decodeURIComponent(passage[1]));
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
}
