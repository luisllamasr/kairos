import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  getStoredThemePreference,
  setStoredThemePreference,
  ThemePreference,
} from '@/lib/app-preferences-storage';

interface ThemePreferenceContextValue {
  themePreference: ThemePreference;
  setThemePreference: (value: ThemePreference) => void;
  // Resolved scheme: the device scheme when preference is 'system', otherwise the override.
  colorScheme: 'light' | 'dark';
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const deviceScheme = useColorScheme();
  // Defaults to 'system' until the persisted value loads (usually within a frame),
  // so first paint already matches today's system-only behaviour.
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    void getStoredThemePreference().then((stored) => {
      if (!cancelled) setThemePreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setThemePreference(value: ThemePreference) {
    setThemePreferenceState(value);
    void setStoredThemePreference(value);
  }

  const colorScheme: 'light' | 'dark' =
    themePreference === 'system' ? (deviceScheme === 'dark' ? 'dark' : 'light') : themePreference;

  const value = useMemo(
    () => ({ themePreference, setThemePreference, colorScheme }),
    [themePreference, colorScheme],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceContextValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  return ctx;
}
