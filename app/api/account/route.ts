import { poemsApi } from '@/lib/server/api/server';

// Deletes the signed-in user's account and everything they stored.
export const DELETE = (request: Request) => poemsApi.deleteAccount(request);
