import { Stack, ThemeProvider } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { AuthProvider } from '@/context/auth-context';
import { ThemePreferenceProvider, useThemePreference } from '@/context/theme-preference-context';
import { I18nProvider } from '@/i18n';
import {
  getNavigationTheme,
  getRootStackScreenOptions,
} from '@/navigation/navigation-theme';

function RootNavigator() {
  const { colorScheme } = useThemePreference();
  const navigationTheme = getNavigationTheme(colorScheme);

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={getRootStackScreenOptions(navigationTheme.colors.background)} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemePreferenceProvider>
        <AuthProvider>
          <I18nProvider>
            <RootNavigator />
          </I18nProvider>
        </AuthProvider>
      </ThemePreferenceProvider>
    </SafeAreaProvider>
  );
}
