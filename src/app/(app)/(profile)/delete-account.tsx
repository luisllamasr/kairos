import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { deleteAccount } from '@/lib/account';

export default function DeleteAccountScreen() {
  const { profile, completeAccountDeletion } = useAuth();
  const { t } = useI18n();

  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = profile?.username ?? '';
  const canDelete = confirmText === username;

  async function handleDelete() {
    if (!canDelete || loading) return;

    setLoading(true);
    setError(null);

    const result = await deleteAccount();

    if (!result.ok) {
      setLoading(false);
      if (result.error === 'unauthorized') {
        setError(t('deleteAccount.error.unauthorized'));
      } else {
        setError(t('deleteAccount.error.failed'));
      }
      return;
    }

    await completeAccountDeletion();
  }

  return (
    <Screen centered avoidKeyboard edges={['top', 'left', 'right']}>
      <Text variant="title" style={styles.title}>
        {t('deleteAccount.title')}
      </Text>
      <Text variant="subtitle" style={styles.warning}>
        {t('deleteAccount.warning')}
      </Text>

      <Text variant="caption" style={styles.prompt}>
        {t('deleteAccount.confirmPrompt', { username })}
      </Text>
      <Input
        value={confirmText}
        onChangeText={(text) => {
          setConfirmText(text.toLowerCase());
          setError(null);
        }}
        placeholder={username}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
        style={styles.input}
      />

      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Button
        label={t('deleteAccount.submit')}
        variant="destructive"
        onPress={handleDelete}
        loading={loading}
        disabled={!canDelete}
        style={styles.deleteButton}
      />
      <Button
        label={t('deleteAccount.cancel')}
        variant="secondary"
        onPress={() => router.back()}
        disabled={loading}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  warning: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  prompt: {
    marginBottom: Spacing.xs,
  },
  input: {
    marginBottom: Spacing.lg,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  deleteButton: {
    marginBottom: Spacing.sm,
  },
});
