import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Subscribe to auth state changes first.
    // Fires immediately with INITIAL_SESSION using the locally stored session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSession(session);
    });

    // Validate the stored session against the server on every app start.
    // getUser() makes a real network request; getSession() only reads local storage.
    // This catches cases like a user being deleted directly in the Supabase dashboard.
    supabase.auth.getUser().then(({ error }) => {
      if (!mounted) return;

      if (error && 'status' in error) {
        // The server rejected the session (user deleted, token revoked, etc.).
        // Clear in-memory state immediately, then best-effort cleanup of local storage.
        setSession(null);
        supabase.auth.signOut().catch(() => null);
      }
      // Network errors or no stored session: keep the local session as fallback.
      // 'status' is only present on AuthApiError (server HTTP responses), not on
      // AuthSessionMissingError or network failures.

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
