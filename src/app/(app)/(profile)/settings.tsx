import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useGuardedPush } from '@/hooks/use-guarded-push';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

export default function SettingsScreen() {
  const { signOutAccount } = useAuth();
  const { t } = useI18n();
  const push = useGuardedPush();

  async function handleSignOut() {
    await signOutAccount();
  }

  return (
    <Screen edges={['top', 'left', 'right']} style={styles.screen}>
      <Button
        label={t('settings.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      <Text variant="title" style={styles.title}>
        {t('settings.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('settings.subtitle')}
      </Text>

      <View style={styles.links}>
        <SettingsLink
          label={t('settings.preferences')}
          onPress={() => push('/(app)/(profile)/preferences')}
        />
        <SettingsLink
          label={t('settings.privacy')}
          onPress={() => push('/(app)/(profile)/privacy')}
        />
        <SettingsLink
          label={t('profile.switchAccount')}
          onPress={() => push('/(app)/(profile)/switch-account')}
        />
        <SettingsLink label={t('profile.signOut')} onPress={() => void handleSignOut()} />
        <SettingsLink
          label={t('profile.deleteAccount')}
          onPress={() => push('/(app)/(profile)/delete-account')}
          destructive
        />
      </View>
    </Screen>
  );
}

function SettingsLink({
  label,
  onPress,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const colors = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Text variant="body" style={destructive ? { color: colors.error } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: Spacing.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.xl,
  },
  links: {
    gap: Spacing.md,
  },
  link: {
    paddingVertical: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
