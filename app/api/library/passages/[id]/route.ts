import { libraryApi } from '@/lib/server/api/server';

type Context = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Context) => libraryApi.passage(request, (await params).id);
