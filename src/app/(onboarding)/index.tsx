import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

// Username validation — must stay consistent with the database CHECK constraints:
//   profiles_username_format:       ^[a-z0-9._-]{3,30}$
//   profiles_username_has_alphanum: [a-z0-9]
//
// isOnlyValidUsernameChars uses charCodeAt instead of a regex character class
// because Hermes (React Native's JS engine) inconsistently handles classes
// containing period and hyphen — /^[-a-z0-9._]+$/ fails to match '-' and '.'
// at runtime despite both being correctly included in the class.
function isOnlyValidUsernameChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (
      (c >= 97 && c <= 122) || // a-z
      (c >= 48 && c <= 57) ||  // 0-9
      c === 46 ||               // .
      c === 95 ||               // _
      c === 45                  // -
    ) {
      continue;
    }
    return false;
  }
  return true;
}

const USERNAME_HAS_ALPHANUM = /[a-z0-9]/;

// Uploads the avatar using base64 data from expo-image-picker.
//
// Why not fetch(localUri).blob():
//   React Native's Hermes fetch implementation does not read local file:// URIs
//   into the response body — the resulting blob is always 0 bytes.
//
// Why base64 + atob + Uint8Array:
//   expo-image-picker reads the file at the native layer and returns base64.
//   atob() is available globally in React Native 0.71+ (Hermes includes it).
//   Uploading a Uint8Array is reliable across all Supabase JS SDK versions.
async function uploadAvatar(base64Data: string, userId: string): Promise<string | null> {
  try {
    const path = `${userId}/avatar.jpg`;
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

export default function OnboardingScreen() {
  const { session, refreshProfile } = useAuth();
  const { t } = useI18n();

  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  // base64 string returned by expo-image-picker — used for upload, not for display.
  const [localAvatarBase64, setLocalAvatarBase64] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError(t('onboarding.error.avatarPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.8,
      // Request base64 so the upload can use the native-layer file data
      // instead of going through fetch() which produces empty blobs in RN.
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setLocalAvatarUri(result.assets[0].uri);
      setLocalAvatarBase64(result.assets[0].base64 ?? null);
      setError(null);
    }
  }

  function validate(): string | null {
    const u = username.trim();
    const d = displayName.trim();

    if (
      !u ||
      u.length < 3 ||
      !isOnlyValidUsernameChars(u) ||
      !USERNAME_HAS_ALPHANUM.test(u)
    ) {
      return t('onboarding.error.usernameInvalid');
    }

    if (!d) return t('onboarding.error.displayNameInvalid');
    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    // Upload avatar first (if selected) so the storage path is available
    // for the profile update in the same operation.
    let avatarPath: string | undefined;
    if (localAvatarBase64) {
      const uploaded = await uploadAvatar(localAvatarBase64, session!.user.id);
      if (uploaded === null) {
        setError(t('onboarding.error.avatarUpload'));
        setLoading(false);
        return;
      }
      avatarPath = uploaded;
    }

    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        username: username.trim(),
        display_name: displayName.trim(),
        ...(avatarPath ? { avatar_url: avatarPath } : {}),
      })
      .eq('id', session!.user.id);

    setLoading(false);

    if (saveError) {
      // 23505 = unique_violation — username is already taken.
      if (saveError.code === '23505') {
        setError(t('onboarding.error.usernameTaken'));
      } else {
        setError(t('onboarding.error.save'));
      }
      return;
    }

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

      <Avatar
        uri={localAvatarUri}
        displayName={displayName || undefined}
        size={88}
        onPress={handlePickAvatar}
        showEditBadge
        style={styles.avatar}
      />
      <Text variant="caption" style={styles.avatarLabel}>
        {t('onboarding.avatar.label')}
      </Text>

      <Input
        value={username}
        onChangeText={(text) => {
          setUsername(text.toLowerCase());
          setError(null);
        }}
        placeholder={t('onboarding.username.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={30}
        style={styles.input}
      />
      <View style={styles.rules}>
        <Text variant="caption">{t('onboarding.username.rules.length')}</Text>
        <Text variant="caption">{t('onboarding.username.rules.chars')}</Text>
        <Text variant="caption">{t('onboarding.username.rules.alphanum')}</Text>
      </View>

      <Input
        value={displayName}
        onChangeText={(text) => {
          setDisplayName(text);
          setError(null);
        }}
        placeholder={t('onboarding.displayName.placeholder')}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={50}
        style={styles.input}
      />
      <View style={styles.rules}>
        <Text variant="caption">{t('onboarding.displayName.rules.length')}</Text>
      </View>

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
    marginBottom: Spacing.lg,
  },
  avatar: {
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  avatarLabel: {
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    marginBottom: Spacing.xs,
  },
  rules: {
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  button: {
    marginTop: Spacing.sm,
  },
});
