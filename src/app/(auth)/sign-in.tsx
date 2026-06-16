import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
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
        Sign in to Kairos
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        We will send a code to your email.
      </Text>
      <Input
        value={email}
        onChangeText={setEmail}
        placeholder="your@email.com"
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
      <Button label="Send code" onPress={handleSendCode} loading={loading} />
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
