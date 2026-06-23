import { Stack } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/context/auth-context';
import { I18nProvider } from '@/i18n';
import { getNavigationTheme, getStackScreenOptions } from '@/navigation/navigation-theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const navigationTheme = getNavigationTheme(scheme);

  return (
    <AuthProvider>
      <I18nProvider>
        <ThemeProvider value={navigationTheme}>
          <Stack screenOptions={getStackScreenOptions(navigationTheme.colors.background)} />
        </ThemeProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
