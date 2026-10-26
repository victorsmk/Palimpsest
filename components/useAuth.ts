'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { getAuth } from '@/lib/auth/runtime';
import type { AuthManager } from '@/lib/auth/AuthManager';
import type { AuthState } from '@/lib/auth/types';
import { backendKind } from '@/lib/services';

const LOADING: AuthState = { status: 'loading' };
const NEVER = () => () => {};

export interface UseAuth {
  /** False when poems are kept in the browser: there is nothing to sign in to, and no sign-in is shown. */
  enabled: boolean;
  state: AuthState;
  /** Null when not enabled, and on the server. */
  manager: AuthManager | null;
}

/** Who is signed in, following changes. */
export function useAuth(): UseAuth {
  const enabled = backendKind === 'server';
  const manager = enabled && typeof window !== 'undefined' ? getAuth() : null;
  const subscribe = useCallback((listener: () => void) => (manager ? manager.subscribe(listener) : NEVER()), [manager]);
  const state = useSyncExternalStore(
    subscribe,
    () => manager?.getState() ?? LOADING,
    () => LOADING
  );
  return { enabled, state, manager };
}
