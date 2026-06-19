import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
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
import { cleanupUserAvatars, getAvatarPublicUrl, uploadAvatar, validateUsername } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export default function EditProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const { t } = useI18n();

  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  // base64 string returned by expo-image-picker — used for upload, not for display.
  const [localAvatarBase64, setLocalAvatarBase64] = useState<string | null>(null);
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError(t('editProfile.error.avatarPermission'));
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

    if (!validateUsername(u)) return t('editProfile.error.usernameInvalid');
    if (!d) return t('editProfile.error.displayNameInvalid');
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

    // Defensive: if the user picked an image but the picker returned no base64 data
    // (can happen on some Android configurations despite base64: true), surface the
    // error rather than silently skipping the upload and saving without a new avatar.
    if (localAvatarUri && !localAvatarBase64) {
      setError(t('editProfile.error.avatarUpload'));
      setLoading(false);
      return;
    }

    // Upload avatar first so the new path is available for the DB update.
    // Each upload goes to a unique timestamped path — the old file is cleaned
    // up below after the DB update confirms the switch was successful.
    let avatarPath: string | undefined;
    if (localAvatarBase64) {
      const uploaded = await uploadAvatar(localAvatarBase64, session!.user.id);
      if (uploaded === null) {
        setError(t('editProfile.error.avatarUpload'));
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
        setError(t('editProfile.error.usernameTaken'));
      } else {
        setError(t('editProfile.error.save'));
      }
      return;
    }

    // Sweep all stale avatars for this user after a successful DB update.
    // Fire-and-forget: cleanup failure never blocks the user. The sweep is
    // self-healing — any orphans from a previous failed cleanup are removed
    // automatically the next time the user saves a new avatar.
    if (avatarPath) {
      void cleanupUserAvatars(session!.user.id, avatarPath);
    }

    await refreshProfile();
    router.back();
  }

  // localAvatarUri takes priority — shows the newly picked image before upload.
  // Falls back to the existing CDN URL, or null which renders the initials placeholder.
  const avatarUri = localAvatarUri ?? getAvatarPublicUrl(profile?.avatar_url);

  return (
    <Screen centered avoidKeyboard edges={['top', 'left', 'right']}>
      <Text variant="title" style={styles.title}>
        {t('editProfile.title')}
      </Text>

      <Avatar
        uri={avatarUri}
        displayName={displayName || undefined}
        size={88}
        onPress={handlePickAvatar}
        showEditBadge
        style={styles.avatar}
      />
      <Text variant="caption" style={styles.avatarLabel}>
        {t('editProfile.avatar.label')}
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
        <Text variant="caption">{t('profile.username.rules.length')}</Text>
        <Text variant="caption">{t('profile.username.rules.chars')}</Text>
        <Text variant="caption">{t('profile.username.rules.alphanum')}</Text>
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
        <Text variant="caption">{t('profile.displayName.rules.length')}</Text>
      </View>

      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Button
        label={t('editProfile.submit')}
        onPress={handleSave}
        loading={loading}
        style={styles.saveButton}
      />
      <Button
        label={t('editProfile.cancel')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.cancelButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
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
  saveButton: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cancelButton: {},
});
