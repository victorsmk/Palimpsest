import { poemsApi } from '@/lib/server/api/server';

type Context = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Context) => poemsApi.get(request, (await params).id);
export const PUT = async (request: Request, { params }: Context) => poemsApi.update(request, (await params).id);
export const DELETE = async (request: Request, { params }: Context) => poemsApi.remove(request, (await params).id);
