import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { FontSize, Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { otpPending } from '@/lib/otp-pending';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const { t } = useI18n();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard against navigation state restoration.
  // Expo Router can restore this screen on app restart via its saved nav state.
  // otpPending is an in-memory flag (cleared on restart) that confirms the user
  // arrived through sign-in's handleSendCode, not through state restoration.
  // If the check fails, redirect immediately to the email input screen.
  useEffect(() => {
    if (!email || otpPending.get() !== email) {
      router.replace('/(auth)/sign-in');
    }
  }, [email]);

  // Supabase's own text ("Token has expired or is invalid") is accurate but
  // not user-facing copy — mirrors sign-in's mapSendError for the same reason:
  // map known cases to friendly copy, fall back to a generic message for
  // anything unrecognized rather than ever showing the raw provider string.
  function mapVerifyError(message: string): string {
    if (/expired/i.test(message) || /invalid/i.test(message)) {
      return t('auth.verify.error.invalidCode');
    }
    return t('auth.verify.error.generic');
  }

  async function handleVerify() {
    if (!code.trim() || !email) return;

    setLoading(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });

    setLoading(false);

    if (verifyError) {
      setError(mapVerifyError(verifyError.message));
    } else {
      // Clear the pending flag on successful verification.
      otpPending.clear();
      // onAuthStateChange in AuthProvider fires automatically —
      // (auth)/_layout.tsx handles the redirect to /(app).
    }
  }

  function handleGoBack() {
    otpPending.clear();
    router.back();
  }

  return (
    <Screen centered avoidKeyboard>
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
      <Button
        label={t('auth.verify.changeEmail')}
        variant="secondary"
        onPress={handleGoBack}
        style={styles.backButton}
      />
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
  backButton: {
    marginTop: Spacing.sm,
  },
});
