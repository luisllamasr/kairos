import { useLocalSearchParams } from 'expo-router';
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

export default function VerifyScreen() {
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
    <View style={styles.container}>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}.</Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="000000"
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Verify code</Text>
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
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
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
