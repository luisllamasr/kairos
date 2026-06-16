import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/hooks/use-session';

export default function AppLayout() {
  const { session, loading } = useSession();

  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
