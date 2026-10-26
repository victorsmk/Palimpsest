import type { PoemsApi } from '@/lib/server/api/handlers';

/**
 * A `fetch` that answers from the poems API in the same process, the way the Next server would: it picks
 * the handler by method and path, and hands a dynamic segment over decoded (Next does that too). The
 * browser's repository can then be run against the real handlers without a web server.
 */
export function inProcessFetch(api: PoemsApi): typeof fetch {
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
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
}
