import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { uploadAvatar, validateUsername } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { MemoriesVisibility } from '@/types/profile';

export default function OnboardingScreen() {
  const { session, refreshProfile } = useAuth();
  const { t } = useI18n();

  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  // base64 string returned by expo-image-picker — used for upload, not for display.
  const [localAvatarBase64, setLocalAvatarBase64] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  // Privacy v1 (docs/PROJECT.md §6): pre-selected 'friends' so the user can
  // continue immediately without making a choice, while still landing on the
  // intentional, neutral default rather than an implicit one.
  const [memoriesVisibility, setMemoriesVisibility] = useState<MemoriesVisibility>('friends');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memoriesVisibilityOptions: { value: MemoriesVisibility; label: string }[] = [
    { value: 'only_me', label: t('onboarding.memoriesVisibility.onlyMe') },
    { value: 'friends', label: t('onboarding.memoriesVisibility.friends') },
    { value: 'everyone', label: t('onboarding.memoriesVisibility.everyone') },
  ];

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

    if (!validateUsername(u)) return t('onboarding.error.usernameInvalid');
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
        memories_visibility: memoriesVisibility,
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
    <Screen centered avoidKeyboard>
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

      <Text variant="body" style={styles.sectionTitle}>
        {t('onboarding.memoriesVisibility.title')}
      </Text>
      <Text variant="caption" style={styles.sectionSubtitle}>
        {t('onboarding.memoriesVisibility.subtitle')}
      </Text>
      <View style={styles.group}>
        {memoriesVisibilityOptions.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            selected={memoriesVisibility === option.value}
            onPress={() => setMemoriesVisibility(option.value)}
          />
        ))}
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

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <Text variant="body">{label}</Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
      ) : (
        <Ionicons name="ellipse-outline" size={22} color={colors.border} />
      )}
    </Pressable>
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
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    marginBottom: Spacing.sm,
  },
  group: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    marginBottom: Spacing.sm,
  },
  button: {
    marginTop: Spacing.sm,
  },
});
