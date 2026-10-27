import { libraryApi } from '@/lib/server/api/server';

export const GET = async (request: Request) => libraryApi.random(request);
