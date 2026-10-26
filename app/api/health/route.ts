import { healthResponse } from '@/lib/server/api/server';

// Whether the server is set up: settings, database, sign-in. Needs no sign-in; says only what is missing and what works.
export const GET = (request: Request) => healthResponse(request);
