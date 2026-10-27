import { textsApi } from '@/lib/server/api/server';

type Context = { params: Promise<{ id: string }> };

export const PUT = async (request: Request, { params }: Context) => textsApi.update(request, (await params).id);
export const DELETE = async (request: Request, { params }: Context) => textsApi.remove(request, (await params).id);
