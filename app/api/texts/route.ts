import { textsApi } from '@/lib/server/api/server';

// The texts the signed-in user has added. See lib/server/api/texts.ts.
export const GET = (request: Request) => textsApi.list(request);
export const POST = (request: Request) => textsApi.create(request);
