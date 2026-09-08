import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { MemoriesVisibility } from '@/types/profile';

export default function PrivacyScreen() {
  const { t } = useI18n();
  const { session, profile, refreshProfile } = useAuth();

  // Saved = last known-persisted value (from the loaded profile). Draft =
  // what the radio rows currently show. They only diverge while the user
  // has an unsaved selection, which is exactly when the Save button should
  // appear — see the explicit draft/save model requested for this screen
  // (docs/PROJECT.md §6), replacing the previous save-on-tap behavior.
  const [saved, setSaved] = useState<MemoriesVisibility>(profile?.memories_visibility ?? 'friends');
  const [draft, setDraft] = useState<MemoriesVisibility>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const options: { value: MemoriesVisibility; label: string }[] = [
    { value: 'only_me', label: t('privacy.memoriesVisibility.onlyMe') },
    { value: 'friends', label: t('privacy.memoriesVisibility.friends') },
    { value: 'everyone', label: t('privacy.memoriesVisibility.everyone') },
  ];

  const hasChanges = draft !== saved;

  function handleSelect(value: MemoriesVisibility) {
    if (saving) return;
    setError(false);
    setDraft(value);
  }

  async function handleSave() {
    if (!hasChanges || saving || !session) return;

    setError(false);
    setSaving(true);

    const { error: saveError } = await supabase
      .from('profiles')
      .update({ memories_visibility: draft })
      .eq('id', session.user.id);

    setSaving(false);

    if (saveError) {
      // Nothing was persisted, so there's no optimistic state to revert —
      // keep the user's draft selection intact and let them retry Save
      // immediately rather than forcing them to re-pick.
      setError(true);
      return;
    }

    setSaved(draft);
    await refreshProfile();
  }

  return (
    <Screen edges={['top', 'left', 'right']} style={styles.screen}>
      <Button
        label={t('privacy.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      <Text variant="title" style={styles.title}>
        {t('privacy.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('privacy.subtitle')}
      </Text>

      <Text variant="body" style={styles.sectionTitle}>
        {t('privacy.memoriesVisibility.title')}
      </Text>
      <View style={styles.group}>
        {options.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            selected={draft === option.value}
            onPress={() => handleSelect(option.value)}
          />
        ))}
      </View>

      {hasChanges ? (
        <Button
          label={t('privacy.saveChanges')}
          onPress={() => void handleSave()}
          loading={saving}
          style={styles.saveButton}
        />
      ) : null}

      {error ? (
        <Text variant="error" style={styles.error}>
          {t('privacy.error.save')}
        </Text>
      ) : null}
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
  screen: {
    paddingBottom: Spacing.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  group: {
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  saveButton: {
    marginBottom: Spacing.md,
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
    marginTop: Spacing.sm,
  },
});
