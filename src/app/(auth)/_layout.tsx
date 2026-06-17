import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) return null;
  // Any session holder is redirected out of the auth group.
  // (app)/_layout.tsx handles the profile-completeness check from there.
  if (session) return <Redirect href="/(app)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
