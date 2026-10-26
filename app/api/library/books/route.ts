import { libraryApi } from '@/lib/server/api/server';

export const GET = (request: Request) => libraryApi.books(request);
