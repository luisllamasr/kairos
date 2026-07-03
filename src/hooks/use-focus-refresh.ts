import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Runs `loadFn` on screen focus. The first run sets `initialLoading`; later runs
 * refresh silently while stale UI stays visible.
 */
export function useFocusRefresh(loadFn: () => Promise<void>) {
  const [initialLoading, setInitialLoading] = useState(true);
  const loadedOnceRef = useRef(false);

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading ?? !loadedOnceRef.current;
      if (showLoading) setInitialLoading(true);
      try {
        await loadFn();
        loadedOnceRef.current = true;
      } finally {
        if (showLoading) setInitialLoading(false);
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
