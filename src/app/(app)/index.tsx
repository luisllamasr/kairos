import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <Screen centered style={styles.screen}>
      <Text variant="hero" style={styles.title}>
        Kairos
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        Experiences worth remembering.
      </Text>
      <Button label="Sign out" variant="secondary" onPress={handleSignOut} />
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
