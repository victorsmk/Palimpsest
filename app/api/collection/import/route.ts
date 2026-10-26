import { poemsApi } from '@/lib/server/api/server';

export const POST = (request: Request) => poemsApi.importPoems(request);
