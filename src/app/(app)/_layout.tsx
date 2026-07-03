import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';

import { BootstrapScreen } from '@/components/BootstrapScreen';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

export default function AppLayout() {
  const { session, profile, profileError, loading } = useAuth();
  const { t } = useI18n();
  const colors = useTheme();

  if (loading) return <BootstrapScreen />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  // Only redirect when profile loaded successfully and is incomplete.
  // profileError: the user is already in the app — a transient network error should not
  // kick them to onboarding. They stay here and can retry profile actions inside the app.
  if (!profileError && profile && !profile.username) return <Redirect href="/(onboarding)" />;

  return (
    <Tabs
      key={session.user.id}
      screenOptions={{
        headerShown: false,
        lazy: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
          popToTopOnBlur: true,
        }}
      />
      <Tabs.Screen
        name="(search)"
        options={{
          title: t('tab.search'),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={24} color={color} />
          ),
          popToTopOnBlur: true,
        }}
      />
      <Tabs.Screen
        name="(profile)"
        options={{
          title: t('tab.profile'),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
          // Reset the Profile stack to index when leaving the tab (e.g. from Edit Profile).
          popToTopOnBlur: true,
        }}
      />
    </Tabs>
  );
}
