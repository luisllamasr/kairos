import { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  AccountSnapshot,
  deactivateActiveSessionInVault,
  getStoredSessionJson,
  listAccountSnapshots,
  persistSessionInVault,
  removeAccountFromVault,
  setActiveUserInVault,
  setAuthRemoveMode,
  updateAccountSnapshot,
} from '@/lib/auth-storage';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/profile';

interface AuthContextValue {
  session: Session | null;
  // null means: no session, still loading, or profile fetch failed.
  // An incomplete profile (username IS NULL) is NOT null — it is a valid Profile object.
  profile: Profile | null;
  // true when the session exists but the profile fetch failed (network error, DB issue).
  // Routing must treat this as distinct from an incomplete profile.
  // Do not route to onboarding on profileError — the user may already have a complete profile.
  profileError: boolean;
  loading: boolean;
  // Remembered accounts on this device (may include inactive sessions).
  accounts: AccountSnapshot[];
  // Call after onboarding completes or when retrying after a profileError.
  refreshProfile: () => Promise<void>;
  // Switch to another remembered account without revoking the current session.
  switchAccount: (userId: string) => Promise<boolean>;
  // Revoke and remove the current account; auto-switch if others remain.
  signOutAccount: () => Promise<void>;
  // Keep current account in vault, open sign-in to add another.
  addAccount: () => Promise<void>;
  // Restore a stored account and return to the switcher (cancel Add account flow).
  cancelAddAccount: (returnUserId: string) => Promise<boolean>;
  // Remove deleted account from vault and switch or sign out.
  completeAccountDeletion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function refreshAccountsList(): Promise<AccountSnapshot[]> {
  return listAccountSnapshots();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);
  // True once the first session read from storage completes (even when session is null).
  const [authInitialized, setAuthInitialized] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountSnapshot[]>([]);
  const [authTransitioning, setAuthTransitioning] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const syncAccounts = useCallback(async () => {
    setAccounts(await refreshAccountsList());
  }, []);

  const activateStoredAccount = useCallback(
    async (userId: string, navigateHome: boolean): Promise<boolean> => {
      const stored = await getStoredSessionJson(userId);
      if (!stored) {
        await removeAccountFromVault(userId);
        return false;
      }

      let accessToken: string;
      let refreshToken: string;
      try {
        const parsed = JSON.parse(stored) as {
          access_token?: string;
          refresh_token?: string;
        };
        if (!parsed.access_token || !parsed.refresh_token) {
          await removeAccountFromVault(userId);
          return false;
        }
        accessToken = parsed.access_token;
        refreshToken = parsed.refresh_token;
      } catch {
        await removeAccountFromVault(userId);
        return false;
      }

      // Point storage at this user before setSession so internal getItem calls succeed.
      await setActiveUserInVault(userId);

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError || !sessionData.session) {
        await removeAccountFromVault(userId);
        return false;
      }

      // Apply session synchronously so routing sees it before onAuthStateChange flushes.
      setSession(sessionData.session);
      sessionRef.current = sessionData.session;
      if (navigateHome) {
        router.replace('/(app)/(home)');
      }
      return true;
    },
    [],
  );

  // Effect 1 — auth subscription and server-side session validation.
  useEffect(() => {
    let mounted = true;

    syncAccounts();

    // Hydrate from storage before routing — prevents a brief redirect to sign-in
    // while onAuthStateChange has not fired yet.
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setAuthInitialized(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (event === 'INITIAL_SESSION') {
        setAuthInitialized(true);
      }
      if (newSession) {
        syncAccounts();
      }
    });

    supabase.auth.getUser().then(async ({ error }) => {
      if (!mounted) return;
      if (error && 'status' in error) {
        const { data: { session: invalidSession } } = await supabase.auth.getSession();
        const expiredUserId = invalidSession?.user.id ?? sessionRef.current?.user.id;
        if (expiredUserId) {
          await removeAccountFromVault(expiredUserId);
        }

        const remaining = await listAccountSnapshots();
        for (const account of remaining) {
          if (!mounted) return;
          const ok = await activateStoredAccount(account.userId, false);
          if (ok) {
            await syncAccounts();
            return;
          }
        }

        setSession(null);
        setProfile(null);
        setProfileError(false);
        setAuthRemoveMode('active-only');
        await supabase.auth.signOut({ scope: 'local' });
        await syncAccounts();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncAccounts, activateStoredAccount]);

  // Effect 2 — profile fetch, triggered whenever the session changes.
  useEffect(() => {
    let mounted = true;

    if (!authInitialized) return;

    if (!session) {
      setProfile(null);
      setProfileError(false);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setProfileError(false);

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(async ({ data, error }) => {
        if (!mounted) return;

        if (error) {
          setProfileError(true);
          setProfile(null);
        } else {
          setProfile(data);
          setProfileError(false);
          await updateAccountSnapshot(session.user.id, {
            email: session.user.email ?? '',
            username: data.username,
            display_name: data.display_name,
            avatar_url: data.avatar_url,
          });
          if (mounted) await syncAccounts();
        }

        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session, authInitialized, syncAccounts]);

  const refreshProfile = useCallback(async () => {
    const currentSession = sessionRef.current;
    const userId = currentSession?.user.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile(data);
      setProfileError(false);
      await updateAccountSnapshot(userId, {
        email: currentSession.user.email ?? '',
        username: data.username,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
      });
      await syncAccounts();
    }
  }, [syncAccounts]);

  const switchAccount = useCallback(
    async (userId: string): Promise<boolean> => {
      if (sessionRef.current?.user.id === userId) {
        router.replace('/(app)/(home)');
        return true;
      }

      const ok = await activateStoredAccount(userId, true);
      if (ok) {
        await syncAccounts();
      } else {
        await syncAccounts();
      }
      return ok;
    },
    [activateStoredAccount, syncAccounts],
  );

  const signOutAccount = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) return;

    const others = (await listAccountSnapshots()).filter((a) => a.userId !== userId);

    setAuthTransitioning(true);
    try {
      setAuthRemoveMode('purge-active');
      await supabase.auth.signOut({ scope: 'global' });

      if (others.length > 0) {
        await activateStoredAccount(others[0].userId, true);
      }
      await syncAccounts();
    } finally {
      setAuthTransitioning(false);
    }
  }, [activateStoredAccount, syncAccounts]);

  const addAccount = useCallback(async () => {
    const previousUserId = sessionRef.current?.user.id;
    if (!previousUserId) return;

    setAuthTransitioning(true);
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (currentSession) {
        await persistSessionInVault(currentSession);
      }

      // Do NOT call supabase.auth.signOut() here — even scope: 'local' hits
      // /logout and revokes refresh tokens while the vault keeps stale ones.
      await deactivateActiveSessionInVault();
      await supabase.auth.stopAutoRefresh();

      setSession(null);
      setProfile(null);
      setProfileError(false);

      router.replace({
        pathname: '/(auth)/sign-in',
        params: { mode: 'add-account', returnUserId: previousUserId },
      });
    } finally {
      setAuthTransitioning(false);
    }
  }, []);

  const cancelAddAccount = useCallback(
    async (returnUserId: string): Promise<boolean> => {
      setAuthTransitioning(true);
      try {
        const ok = await activateStoredAccount(returnUserId, false);
        if (!ok) {
          return false;
        }
        await syncAccounts();
        router.replace('/(app)/(profile)/switch-account', { withAnchor: true });
        return true;
      } finally {
        setAuthTransitioning(false);
      }
    },
    [activateStoredAccount, syncAccounts],
  );

  const completeAccountDeletion = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) return;

    const others = (await listAccountSnapshots()).filter((a) => a.userId !== userId);

    setAuthTransitioning(true);
    try {
      await removeAccountFromVault(userId);
      setAuthRemoveMode('active-only');
      await supabase.auth.signOut({ scope: 'local' });

      if (others.length > 0) {
        await activateStoredAccount(others[0].userId, true);
        await syncAccounts();
      } else {
        await syncAccounts();
        router.replace('/(auth)/sign-in');
      }
    } finally {
      setAuthTransitioning(false);
    }
  }, [activateStoredAccount, syncAccounts]);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        profileError,
        loading: !authInitialized || profileLoading || authTransitioning,
        accounts,
        refreshProfile,
        switchAccount,
        signOutAccount,
        addAccount,
        cancelAddAccount,
        completeAccountDeletion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
