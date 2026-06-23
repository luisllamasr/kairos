import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { getStackScreenOptions } from '@/navigation/navigation-theme';

export default function HomeLayout() {
  const colors = useTheme();

  return <Stack screenOptions={getStackScreenOptions(colors.background)} />;
}
