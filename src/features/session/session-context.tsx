import { createContext, type PropsWithChildren, use, useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';

export type SessionUser = {
  personId: string;
  fullName: string;
  email: string;
  role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
};

type SessionStatus = 'loading' | 'signedOut' | 'pending' | 'approved';

type SessionValue = {
  status: SessionStatus;
  user: SessionUser | null;
  // True when the server could not be reached, as opposed to the user being signed out
  loadFailed: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

function statusOf(user: SessionUser | null): SessionStatus {
  if (!user) return 'signedOut';
  return user.status === 'approved' ? 'approved' : 'pending';
}

type LoadResult = { user: SessionUser | null; failed: boolean };

async function loadUser(): Promise<LoadResult> {
  try {
    const { user } = await api<{ user: SessionUser | null }>('/api/auth/me');
    return { user, failed: false };
  } catch {
    return { user: null, failed: true };
  }
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const applyResult = useCallback((result: LoadResult) => {
    setUser(result.user);
    setLoadFailed(result.failed);
    setIsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    applyResult(await loadUser());
  }, [applyResult]);

  // Runs only in the browser, so server-rendered pages always start in the loading state
  useEffect(() => {
    loadUser().then(applyResult);
  }, [applyResult]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
      await refresh();
    },
    [refresh]
  );

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <SessionContext
      value={{
        status: isLoading ? 'loading' : statusOf(user),
        user,
        loadFailed,
        refresh,
        signIn,
        signOut,
      }}>
      {children}
    </SessionContext>
  );
}
