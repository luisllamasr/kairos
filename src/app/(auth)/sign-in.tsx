import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { otpPending } from '@/lib/otp-pending';
import { supabase } from '@/lib/supabase';

// Minimal email format check — catches obvious typos before hitting the network.
// Full validation is handled by Supabase; this only prevents the worst UX cases.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seconds remaining before another OTP request is allowed.
  // When > 0, the button is disabled and a live countdown is shown.
  const [cooldown, setCooldown] = useState(0);

  // Decrement cooldown by 1 every second until it reaches zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Maps a Supabase send error to a localized, user-facing message.
  // The app never forwards raw backend strings to the user.
  function mapSendError(message: string): string {
    // Email provider / SMTP failure (various Supabase messages, including
    // "Error sending magic link email", SMTP timeouts, template errors, etc.)
    if (
      /sending/i.test(message) ||
      /magic link/i.test(message) ||
      /smtp/i.test(message) ||
      /email.*error/i.test(message)
    ) {
      return t('auth.signIn.error.sendFailed');
    }
    // Fallback for any other unexpected error.
    return t('auth.signIn.error.generic');
  }

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || cooldown > 0) return;

    // Client-side format check before hitting the network.
    if (!EMAIL_FORMAT.test(trimmed)) {
      setError(t('auth.signIn.error.invalidEmail'));
      return;
    }

    setLoading(true);
    setError(null);

    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (sendError) {
      // Rate limit: extract wait time and start live countdown.
      const match = sendError.message.match(/(\d+) second/);
      if (match) {
        setCooldown(parseInt(match[1], 10));
      } else {
        // All other errors: translate before showing.
        setError(mapSendError(sendError.message));
      }
      return;
    }

    otpPending.set(trimmed);
    router.push({ pathname: '/(auth)/verify', params: { email: trimmed } });
  }

  return (
    <Screen centered avoidKeyboard>
      <Text variant="title" style={styles.title}>
        {t('auth.signIn.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('auth.signIn.subtitle')}
      </Text>
      <Input
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError(null);
        }}
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
      {cooldown > 0 ? (
        <Text variant="error" style={styles.error}>
          {t('auth.signIn.rateLimited', { seconds: String(cooldown) })}
        </Text>
      ) : null}
      <Button
        label={t('auth.signIn.submit')}
        onPress={handleSendCode}
        loading={loading}
        disabled={cooldown > 0}
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
  input: {
    marginBottom: Spacing.md,
  },
  error: {
    marginBottom: Spacing.sm,
  },
});
