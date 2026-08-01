import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * App-wide replacement for `router.push` on user-driven navigations.
 *
 * Ignores rapid repeat presses until the originating screen regains focus.
 * Without this, a double-tap on a list row or button can stack the same
 * destination twice (`router.push` always pushes), so Back lands on a
 * duplicate instead of the previous screen.
 *
 * Prefer this over bare `router.push` for every press/list entry point.
 * Keep `router.replace` / `router.back` for flows that intentionally do not
 * grow the stack.
 */
export function useGuardedPush() {
  const lockedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      lockedRef.current = false;
    }, []),
  );

  return useCallback((href: Href) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    router.push(href);
  }, []);
}
