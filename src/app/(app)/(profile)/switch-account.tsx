import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { getAvatarPublicUrl } from '@/lib/profile';

export default function SwitchAccountScreen() {
  const { session, accounts, switchAccount, addAccount } = useAuth();
  const { t } = useI18n();
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeUserId = session?.user.id;

  async function handleSwitch(userId: string) {
    if (userId === activeUserId || loadingUserId) return;

    setLoadingUserId(userId);
    setError(null);

    const ok = await switchAccount(userId);
    setLoadingUserId(null);

    if (!ok) {
      setError(t('switchAccount.error.failed'));
    }
  }

  return (
    <Screen edges={['top', 'left', 'right']} style={styles.screen}>
      <Text variant="title" style={styles.title}>
        {t('switchAccount.title')}
      </Text>

      <View style={styles.list}>
        {accounts.map((account) => {
          const isActive = account.userId === activeUserId;
          const isLoading = loadingUserId === account.userId;
          const label =
            account.display_name ||
            (account.username ? `@${account.username}` : account.email);

          return (
            <Pressable
              key={account.userId}
              style={[styles.row, isActive && styles.rowActive]}
              onPress={() => handleSwitch(account.userId)}
              disabled={isActive || loadingUserId !== null}
            >
              <Avatar
                uri={getAvatarPublicUrl(account.avatar_url)}
                displayName={account.display_name ?? account.username ?? account.email}
                size={48}
              />
              <View style={styles.rowText}>
                <Text variant="body">{label}</Text>
                {account.username ? (
                  <Text variant="caption">@{account.username}</Text>
                ) : (
                  <Text variant="caption">{account.email}</Text>
                )}
              </View>
              {isActive ? (
                <Text variant="caption">{t('switchAccount.active')}</Text>
              ) : isLoading ? (
                <Text variant="caption">{t('switchAccount.switching')}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Button
        label={t('switchAccount.addAccount')}
        onPress={() => addAccount()}
        disabled={loadingUserId !== null}
        style={styles.addButton}
      />
      <Button
        label={t('switchAccount.cancel')}
        variant="secondary"
        onPress={() => router.dismissTo('/(app)/(profile)')}
        disabled={loadingUserId !== null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: Spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  list: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: 8,
  },
  rowActive: {
    opacity: 0.85,
  },
  rowText: {
    flex: 1,
    gap: Spacing.xs,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  addButton: {
    marginBottom: Spacing.sm,
  },
});
