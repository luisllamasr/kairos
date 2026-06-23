import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { RememberedAccountRow } from '@/components/RememberedAccountRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';

export default function SwitchAccountScreen() {
  const { session, accounts, switchAccount, reauthAccount, addAccount, forgetAccountOnDevice } =
    useAuth();
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

  async function handleLogIn(userId: string) {
    if (loadingUserId) return;
    setLoadingUserId(userId);
    setError(null);
    try {
      await reauthAccount(userId);
    } finally {
      setLoadingUserId(null);
    }
  }

  function confirmRemove(userId: string) {
    Alert.alert(t('switchAccount.removeConfirm.title'), t('switchAccount.removeConfirm.message'), [
      { text: t('switchAccount.removeConfirm.cancel'), style: 'cancel' },
      {
        text: t('switchAccount.removeFromDevice'),
        style: 'destructive',
        onPress: async () => {
          setLoadingUserId(userId);
          setError(null);
          try {
            await forgetAccountOnDevice(userId);
          } finally {
            setLoadingUserId(null);
          }
        },
      },
    ]);
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

          return (
            <RememberedAccountRow
              key={account.userId}
              account={account}
              isActive={isActive}
              isLoading={isLoading}
              disabled={loadingUserId !== null && !isLoading}
              onPress={
                account.hasSession && !isActive
                  ? () => handleSwitch(account.userId)
                  : undefined
              }
              onLogIn={!account.hasSession ? () => handleLogIn(account.userId) : undefined}
              showRemove={!account.hasSession}
              onRemove={
                !account.hasSession
                  ? () => confirmRemove(account.userId)
                  : undefined
              }
            />
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
    gap: Spacing.md,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  addButton: {
    marginBottom: Spacing.sm,
  },
});
