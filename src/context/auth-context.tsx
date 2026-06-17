import { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

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
  // Call after onboarding completes or when retrying after a profileError.
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Ref keeps refreshProfile stable (empty deps) while always reading current session.
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Effect 1 — auth subscription and server-side session validation.
  // Owns a single onAuthStateChange listener for the entire app lifetime.
  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
    });

    // getUser() validates the stored session against the server.
    // getSession() reads only local storage and cannot detect revoked sessions.
    supabase.auth.getUser().then(({ error }) => {
      if (!mounted) return;
      if (error && 'status' in error) {
        // Server rejected the session (deleted user, revoked token, etc.).
        setSession(null);
        setProfile(null);
        setProfileError(false);
        supabase.auth.signOut().catch(() => null);
      }
      // Do not setLoading(false) here.
      // Effect 2 owns final loading resolution once it knows whether a profile exists.
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Effect 2 — profile fetch, triggered whenever the session changes.
  // React's cleanup sets mounted = false before the next run, so a stale fetch
  // from a previous session cannot overwrite state after the session changes.
  useEffect(() => {
    let mounted = true;

    if (!session) {
      setProfile(null);
      setProfileError(false);
      setLoading(false);
      return;
    }

    setProfileError(false);

    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;

        if (error) {
          // Network failure or unexpected DB error.
          // The user may have a complete profile — do not assume onboarding is needed.
          setProfileError(true);
          setProfile(null);
        } else {
          setProfile(data);
          setProfileError(false);
        }

        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [session]);

  // Re-fetches the profile for the current session.
  // Used after onboarding completes and after manual retry on profileError.
  const refreshProfile = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile(data);
      setProfileError(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, profileError, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
