import { Stack } from 'expo-router';

import { AuthProvider } from '@/context/auth-context';
import { I18nProvider } from '@/i18n';

export default function RootLayout() {
  return (
    <AuthProvider>
      <I18nProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </I18nProvider>
    </AuthProvider>
  );
}
