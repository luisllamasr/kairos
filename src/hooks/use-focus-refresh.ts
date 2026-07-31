import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Runs `loadFn` on screen focus. The first run sets `initialLoading`; later runs
 * refresh silently while stale UI stays visible.
 */
export function useFocusRefresh(loadFn: () => Promise<void>) {
  const [initialLoading, setInitialLoading] = useState(true);
  const loadedOnceRef = useRef(false);
  // Focus can fire twice in quick succession (fast back-and-forth navigation).
  // If an older refresh() is still awaiting loadFn() when a newer one starts,
  // only the newer call's completion is allowed to clear initialLoading —
  // otherwise the older call finishing later could flip it back off while
  // the newer, still-in-flight load hasn't actually finished yet.
  const generationRef = useRef(0);

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const generation = ++generationRef.current;
      const showLoading = options?.showLoading ?? !loadedOnceRef.current;
      if (showLoading) setInitialLoading(true);
      try {
        await loadFn();
        loadedOnceRef.current = true;
      } finally {
        if (showLoading && generationRef.current === generation) setInitialLoading(false);
      }
    },
    [loadFn],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const resetLoaded = useCallback(() => {
    loadedOnceRef.current = false;
    setInitialLoading(true);
  }, []);

  return { initialLoading, refresh, resetLoaded };
}
