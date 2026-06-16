import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

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
    <View style={styles.container}>
      <Text style={styles.title}>Sign in to Kairos</Text>
      <Text style={styles.subtitle}>We will send a code to your email.</Text>

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="your@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSendCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Send code</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#555555',
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#111111',
  },
  error: {
    color: '#CC0000',
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
