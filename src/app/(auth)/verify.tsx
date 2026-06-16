import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { FontSize, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const { t } = useI18n();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    if (!code.trim() || !email) return;

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    }
    // On success, onAuthStateChange fires in useSession,
    // session state updates, and (app)/_layout.tsx redirects automatically.
  }

  return (
    <Screen centered>
      <Text variant="title" style={styles.title}>
        {t('auth.verify.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('auth.verify.subtitle', { email: email ?? '' })}
      </Text>
      <Input
        value={code}
        onChangeText={setCode}
        placeholder={t('auth.verify.codePlaceholder')}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={styles.codeInput}
      />
      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label={t('auth.verify.submit')} onPress={handleVerify} loading={loading} />
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
  codeInput: {
    fontSize: FontSize.xl,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  error: {
    marginBottom: Spacing.sm,
  },
});
