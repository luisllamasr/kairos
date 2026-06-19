import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';

export default function RootIndex() {
  const { session, profile, profileError, loading, refreshProfile } = useAuth();
  const { t } = useI18n();

  if (loading) return null;

  if (!session) return <Redirect href="/(auth)/sign-in" />;

  // Profile fetch failed (network error, unexpected DB issue).
  // Show a retry screen instead of routing to onboarding — the user may have a complete profile.
  if (profileError) {
    return (
      <Screen centered>
        <Text variant="title" style={styles.errorTitle}>
          {t('error.profileLoad')}
        </Text>
        <Button label={t('error.retry')} onPress={refreshProfile} />
      </Screen>
    );
  }

  if (!profile?.username) return <Redirect href="/(onboarding)" />;
  return <Redirect href="/(app)" />;
}

const styles = StyleSheet.create({
  errorTitle: {
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
});
