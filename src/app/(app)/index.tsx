import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const { t } = useI18n();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <Screen centered style={styles.screen}>
      <Text variant="hero" style={styles.title}>
        {t('home.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('home.subtitle')}
      </Text>
      <Button label={t('home.signOut')} variant="secondary" onPress={handleSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    marginBottom: Spacing.xxl,
    textAlign: 'center',
  },
});
