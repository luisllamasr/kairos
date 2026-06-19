import { Stack } from 'expo-router';

// Stack within the Profile tab enables push navigation to edit-profile
// without leaving the tab bar context.
export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
