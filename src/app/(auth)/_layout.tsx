import { Redirect, Stack } from 'expo-router';

import { BootstrapScreen } from '@/components/BootstrapScreen';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getStackScreenOptions } from '@/navigation/navigation-theme';

export default function AuthLayout() {
  const { session, loading } = useAuth();
  const colors = useTheme();

  if (loading) return <BootstrapScreen />;
  // Any session holder is redirected out of the auth group.
  // (app)/_layout.tsx handles the profile-completeness check from there.
  if (session) return <Redirect href="/(app)/(home)" />;

  return <Stack screenOptions={getStackScreenOptions(colors.background)} />;
}
