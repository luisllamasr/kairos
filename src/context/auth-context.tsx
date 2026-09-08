import { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  deactivateActiveSessionInVault,
  forgetAccountOnDevice,
  getStoredSessionJson,
  hasStoredSession,
  listRememberedAccounts,
  persistSessionInVault,
  purgeSessionFromVault,
  RememberedAccount,
  removeAccountFromVault,
  setActiveUserInVault,
  updateAccountSnapshot,
  withAuthRemoveMode,
} from '@/lib/auth-storage';
import { resetAppNavigationToHome } from '@/navigation/reset-app-navigation';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/profile';

function profileFromSnapshot(
  userId: string,
  snap: Pick<RememberedAccount, 'username' | 'display_name' | 'avatar_url'>,
): Profile {
  return {
    id: userId,
    username: snap.username,
    display_name: snap.display_name,
    avatar_url: snap.avatar_url,
    // Placeholder only — this optimistic snapshot has no privacy setting of
    // its own; it's replaced by the real fetched profile moments later.
    memories_visibility: 'friends',
    created_at: '',
    updated_at: '',
  };
}

function hydrateProfileFromAccounts(
  userId: string,
  remembered: RememberedAccount[],
): Profile | null {
  const snap = remembered.find((account) => account.userId === userId);
  return snap ? profileFromSnapshot(userId, snap) : null;
}

interface AuthContextValue {
  session: Session | null;
  // null means: no session, still loading, or profile fetch failed.
  // An incomplete profile (username IS NULL) is NOT null — it is a valid Profile object.
  profile: Profile | null;
  // true when the session exists but the profile fetch failed (network error, DB issue).
  profileError: boolean;
  loading: boolean;
  profileLoading: boolean;
  /** Remembered accounts on this device (active sessions and signed-out snapshots). */
  accounts: RememberedAccount[];
  refreshProfile: () => Promise<void>;
  switchAccount: (userId: string) => Promise<boolean>;
  /** Revoke active session tokens; snapshot remains for re-auth. */
  signOutAccount: () => Promise<void>;
  addAccount: () => Promise<void>;
  /** OTP re-auth for a signed-out remembered account. */
  reauthAccount: (userId: string) => Promise<void>;
  cancelAddAccount: (returnUserId: string) => Promise<boolean>;
  /** Remove local remembered data only — not server account deletion. */
  forgetAccountOnDevice: (userId: string) => Promise<void>;
  completeAccountDeletion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [authTransitioning, setAuthTransitioning] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const syncAccounts = useCallback(async () => {
    setAccounts(await listRememberedAccounts());
  }, []);

  const activateStoredAccount = useCallback(
    async (
      userId: string,
      navigateHome: boolean,
      options?: { resetProfileStack?: boolean },
    ): Promise<boolean> => {
      const stored = await getStoredSessionJson(userId);
      if (!stored) {
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
          await purgeSessionFromVault(userId);
          return false;
        }
        accessToken = parsed.access_token;
        refreshToken = parsed.refresh_token;
      } catch {
        await purgeSessionFromVault(userId);
        return false;
      }

      await setActiveUserInVault(userId);

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError || !sessionData.session) {
        await purgeSessionFromVault(userId);
        return false;
      }

      if (navigateHome) {
        resetAppNavigationToHome({ resetProfileStack: options?.resetProfileStack });
      }

      setSession(sessionData.session);
      sessionRef.current = sessionData.session;

      const remembered = await listRememberedAccounts();
      const hydrated = hydrateProfileFromAccounts(userId, remembered);
      if (hydrated) {
        setProfile(hydrated);
      }

      return true;
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    void syncAccounts();

    void supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;

      const remembered = await listRememberedAccounts();
      if (mounted) setAccounts(remembered);

      if (initialSession) {
        const hydrated = hydrateProfileFromAccounts(initialSession.user.id, remembered);
        if (hydrated) setProfile(hydrated);
      }

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
        void syncAccounts();
      }
    });

    void supabase.auth.getUser().then(async ({ error }) => {
      if (!mounted) return;
      if (error && 'status' in error) {
        const { data: { session: invalidSession } } = await supabase.auth.getSession();
        const expiredUserId = invalidSession?.user.id ?? sessionRef.current?.user.id;
        if (expiredUserId) {
          await purgeSessionFromVault(expiredUserId);
        }

        const remaining = (await listRememberedAccounts()).filter((a) => a.hasSession);
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
        await withAuthRemoveMode('active-only', () => supabase.auth.signOut({ scope: 'local' }));
        await syncAccounts();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncAccounts, activateStoredAccount]);

  useEffect(() => {
    let mounted = true;

    if (!authInitialized) return;

    if (!session) {
      setProfile(null);
      setProfileError(false);
      setProfileLoading(false);
      return;
    }

    const userId = session.user.id;

    setProfileLoading(true);
    setProfileError(false);

    void listRememberedAccounts().then((remembered) => {
      if (!mounted) return;
      setProfile((prev) => {
        if (prev?.id === userId) return prev;
        return hydrateProfileFromAccounts(userId, remembered);
      });
    });

    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(async ({ data, error }) => {
        if (!mounted) return;

        if (error) {
          setProfileError(true);
          setProfile(null);
        } else {
          setProfile(data);
          setProfileError(false);
          await updateAccountSnapshot(userId, {
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
    // Intentionally keyed on user id (not the whole session) so token refreshes
    // do not re-fetch the profile. sessionRef is used for expiry cleanup below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [session?.user?.id, authInitialized, syncAccounts]);

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
        resetAppNavigationToHome({ resetProfileStack: true });
        return true;
      }

      if (!(await hasStoredSession(userId))) {
        return false;
      }

      const ok = await activateStoredAccount(userId, true, { resetProfileStack: true });
      await syncAccounts();
      return ok;
    },
    [activateStoredAccount, syncAccounts],
  );

  const signOutAccount = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) return;

    const othersWithSession = (await listRememberedAccounts()).filter(
      (a) => a.userId !== userId && a.hasSession,
    );

    setAuthTransitioning(true);
    try {
      await withAuthRemoveMode('purge-session-only', () =>
        supabase.auth.signOut({ scope: 'global' }),
      );

      if (othersWithSession.length > 0) {
        await activateStoredAccount(othersWithSession[0].userId, true);
      }
      await syncAccounts();
    } finally {
      setAuthTransitioning(false);
    }
  }, [activateStoredAccount, syncAccounts]);

  const reauthAccount = useCallback(
    async (userId: string): Promise<void> => {
      if (await hasStoredSession(userId)) {
        await switchAccount(userId);
        return;
      }

      const previousUserId = sessionRef.current?.user.id;
      const returnUserId =
        previousUserId && previousUserId !== userId ? previousUserId : undefined;

      setAuthTransitioning(true);
      try {
        if (previousUserId) {
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();
          if (currentSession) {
            await persistSessionInVault(currentSession);
          }

          await deactivateActiveSessionInVault();
          await supabase.auth.stopAutoRefresh();
          setSession(null);
          setProfile(null);
          setProfileError(false);
        }

        router.replace({
          pathname: '/(auth)/sign-in',
          params: {
            mode: 'reauth-account',
            targetUserId: userId,
            ...(returnUserId ? { returnUserId } : {}),
          },
        });
      } finally {
        setAuthTransitioning(false);
      }
    },
    [switchAccount],
  );

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
        const hasSession = Boolean(sessionRef.current);
        if (hasSession) {
          router.replace('/(app)/(profile)/switch-account', { withAnchor: true });
        } else {
          router.replace('/(auth)/sign-in');
        }
        return true;
      } finally {
        setAuthTransitioning(false);
      }
    },
    [activateStoredAccount, syncAccounts],
  );

  const forgetAccountOnDeviceHandler = useCallback(
    async (userId: string): Promise<void> => {
      if (await hasStoredSession(userId)) {
        return;
      }

      await forgetAccountOnDevice(userId);
      await syncAccounts();
    },
    [syncAccounts],
  );

  const completeAccountDeletion = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) return;

    const othersWithSession = (await listRememberedAccounts()).filter(
      (a) => a.userId !== userId && a.hasSession,
    );

    setAuthTransitioning(true);
    try {
      await removeAccountFromVault(userId);
      await withAuthRemoveMode('active-only', () => supabase.auth.signOut({ scope: 'local' }));

      if (othersWithSession.length > 0) {
        await activateStoredAccount(othersWithSession[0].userId, true);
        await syncAccounts();
      } else {
        await syncAccounts();
        router.replace('/(auth)/sign-in');
      }
    } finally {
      setAuthTransitioning(false);
    }
  }, [activateStoredAccount, syncAccounts]);

  const loading = !authInitialized || authTransitioning;

  const value = useMemo(
    (): AuthContextValue => ({
      session,
      profile,
      profileError,
      loading,
      profileLoading,
      accounts,
      refreshProfile,
      switchAccount,
      signOutAccount,
      addAccount,
      reauthAccount,
      cancelAddAccount,
      forgetAccountOnDevice: forgetAccountOnDeviceHandler,
      completeAccountDeletion,
    }),
    [
      session,
      profile,
      profileError,
      loading,
      profileLoading,
      accounts,
      refreshProfile,
      switchAccount,
      signOutAccount,
      addAccount,
      reauthAccount,
      cancelAddAccount,
      forgetAccountOnDeviceHandler,
      completeAccountDeletion,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
