import { poemsApi } from '@/lib/server/api/server';

export const GET = (request: Request) => poemsApi.count(request);
