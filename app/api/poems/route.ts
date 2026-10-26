import { poemsApi } from '@/lib/server/api/server';

// The poems of the signed-in user. See lib/server/api/handlers.ts.
export const GET = (request: Request) => poemsApi.list(request);
export const POST = (request: Request) => poemsApi.create(request);
