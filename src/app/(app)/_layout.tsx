import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

export default function AppLayout() {
  const { session, profile, profileError, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  // Only redirect to onboarding when the profile loaded successfully and is incomplete.
  // profileError: the user is already in the app — a transient network error should not
  // kick them to onboarding. They stay here and can retry profile actions inside the app.
  if (!profileError && !profile?.username) return <Redirect href="/(onboarding)/index" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
