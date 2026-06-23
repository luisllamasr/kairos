import { Redirect, Stack } from 'expo-router';

import { BootstrapScreen } from '@/components/BootstrapScreen';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getStackScreenOptions } from '@/navigation/navigation-theme';

export default function OnboardingLayout() {
  const { session, profile, loading } = useAuth();
  const colors = useTheme();

  if (loading) return <BootstrapScreen />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  // Profile is now complete — redirect to the main app.
  // This fires automatically after refreshProfile() is called on onboarding completion.
  if (profile?.username) return <Redirect href="/(app)/(home)" />;

  return <Stack screenOptions={getStackScreenOptions(colors.background)} />;
}
