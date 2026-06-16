import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push({ pathname: '/(auth)/verify', params: { email: trimmed } });
  }

  return (
    <Screen centered>
      <Text variant="title" style={styles.title}>
        {t('auth.signIn.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('auth.signIn.subtitle')}
      </Text>
      <Input
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.signIn.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label={t('auth.signIn.submit')} onPress={handleSendCode} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    marginBottom: Spacing.xl,
  },
  input: {
    marginBottom: Spacing.md,
  },
  error: {
    marginBottom: Spacing.sm,
  },
});
