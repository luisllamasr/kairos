import { Stack } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { AuthProvider } from '@/context/auth-context';
import { I18nProvider } from '@/i18n';
import {
  getNavigationTheme,
  getRootStackScreenOptions,
} from '@/navigation/navigation-theme';

function RootNavigator() {
  const scheme = useColorScheme();
  const navigationTheme = getNavigationTheme(scheme);

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={getRootStackScreenOptions(navigationTheme.colors.background)} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <I18nProvider>
          <RootNavigator />
        </I18nProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
