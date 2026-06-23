import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { getStackScreenOptions } from '@/navigation/navigation-theme';

// Stack within the Profile tab enables push navigation to edit-profile
// without leaving the tab bar context.
export default function ProfileLayout() {
  const colors = useTheme();

  return <Stack screenOptions={getStackScreenOptions(colors.background)} />;
}
