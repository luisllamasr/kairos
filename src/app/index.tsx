import { router } from 'expo-router';
import { useLayoutEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { BootstrapScreen } from '@/components/BootstrapScreen';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';

export default function RootIndex() {
  const { session, profile, profileError, loading, profileLoading, refreshProfile } = useAuth();
  const { t } = useI18n();
  const routedRef = useRef(false);

  useLayoutEffect(() => {
    if (loading || routedRef.current) return;

    if (!session) {
      routedRef.current = true;
      router.replace('/(auth)/sign-in');
      return;
    }
    if (profileError) return;
    if (profileLoading && !profile) return;

    routedRef.current = true;
    router.replace(profile?.username ? '/(app)/(home)' : '/(onboarding)');
  }, [loading, session, profile, profileError, profileLoading]);

  if (loading) return <BootstrapScreen />;

  if (!session) return <BootstrapScreen />;

  if (profileLoading && !profile) return <BootstrapScreen />;

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

  if (!profile?.username) return <BootstrapScreen />;

  // Keep bootstrap visible until router.replace hands off to (app).
  return <BootstrapScreen />;
}

const styles = StyleSheet.create({
  errorTitle: {
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
});
