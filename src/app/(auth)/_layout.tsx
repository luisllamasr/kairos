import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/hooks/use-session';

export default function AuthLayout() {
  const { session, loading } = useSession();

  if (loading) return null;
  if (session) return <Redirect href="/(app)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
