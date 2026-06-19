import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

export default function OnboardingLayout() {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  // Profile is now complete — redirect to the main app.
  // This fires automatically after refreshProfile() is called on onboarding completion.
  if (profile?.username) return <Redirect href="/(app)/(home)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
