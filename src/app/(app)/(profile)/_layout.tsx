import { Stack } from 'expo-router';

import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getStackScreenOptions } from '@/navigation/navigation-theme';

// Stack within the Profile tab enables push navigation to edit-profile
// without leaving the tab bar context.
export default function ProfileLayout() {
  const colors = useTheme();
  const { session } = useAuth();

  return (
    <Stack
      key={session?.user.id}
      screenOptions={getStackScreenOptions(colors.background)}
    />
  );
}
