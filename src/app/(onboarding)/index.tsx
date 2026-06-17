import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

// Must match the database CHECK constraints exactly.
// profiles_username_format:     ^[a-z0-9._-]{3,30}$
// profiles_username_has_alphanum: [a-z0-9]
const USERNAME_FORMAT = /^[a-z0-9._-]{3,30}$/;
const USERNAME_HAS_ALPHANUM = /[a-z0-9]/;

export default function OnboardingScreen() {
  const { session, refreshProfile } = useAuth();
  const { t } = useI18n();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    const u = username.trim();
    const d = displayName.trim();

    if (!u) return t('onboarding.error.usernameRequired');
    if (u.length < 3) return t('onboarding.error.usernameTooShort');
    if (!USERNAME_FORMAT.test(u) || !USERNAME_HAS_ALPHANUM.test(u)) {
      return t('onboarding.error.usernameInvalid');
    }
    if (!d) return t('onboarding.error.displayNameRequired');

    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const u = username.trim();
    const d = displayName.trim();

    setLoading(true);
    setError(null);

    const { error: saveError } = await supabase
      .from('profiles')
      .update({ username: u, display_name: d })
      .eq('id', session!.user.id);

    setLoading(false);

    if (saveError) {
      // 23505 = unique_violation — username is taken.
      if (saveError.code === '23505') {
        setError(t('onboarding.error.usernameTaken'));
      } else {
        setError(t('onboarding.error.save'));
      }
      return;
    }

    // Refresh the profile in the AuthProvider.
    // The (onboarding)/_layout.tsx guard will detect profile.username is now set
    // and automatically redirect to /(app) — no explicit navigation needed here.
    await refreshProfile();
  }

  return (
    <Screen centered>
      <Text variant="hero" style={styles.title}>
        {t('onboarding.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('onboarding.subtitle')}
      </Text>

      <Input
        value={username}
        onChangeText={(text) => {
          // Enforce lowercase as the user types — usernames are always lowercase.
          setUsername(text.toLowerCase());
          setError(null);
        }}
        placeholder={t('onboarding.username.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Text variant="caption" style={styles.hint}>
        {t('onboarding.username.hint')}
      </Text>

      <Input
        value={displayName}
        onChangeText={(text) => {
          setDisplayName(text);
          setError(null);
        }}
        placeholder={t('onboarding.displayName.placeholder')}
        autoCapitalize="words"
        autoCorrect={false}
        style={styles.input}
      />

      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Button
        label={t('onboarding.submit')}
        onPress={handleSave}
        loading={loading}
        style={styles.button}
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
    marginBottom: Spacing.xs,
  },
  hint: {
    marginBottom: Spacing.lg,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  button: {
    marginTop: Spacing.sm,
  },
});
