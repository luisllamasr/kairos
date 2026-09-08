import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useThemePreference } from '@/context/theme-preference-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { LanguagePreference, ThemePreference } from '@/lib/app-preferences-storage';

export default function PreferencesScreen() {
  const { t } = useI18n();
  const { themePreference, setThemePreference } = useThemePreference();
  const { languagePreference, setLanguagePreference } = useI18n();

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: t('preferences.theme.light') },
    { value: 'dark', label: t('preferences.theme.dark') },
    { value: 'system', label: t('preferences.theme.system') },
  ];

  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'en', label: t('preferences.language.english') },
    { value: 'es', label: t('preferences.language.spanish') },
    { value: 'system', label: t('preferences.language.system') },
  ];

  return (
    <Screen edges={['top', 'left', 'right']} style={styles.screen}>
      <Button
        label={t('preferences.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      <Text variant="title" style={styles.title}>
        {t('preferences.title')}
      </Text>
      <Text variant="subtitle" style={styles.subtitle}>
        {t('preferences.subtitle')}
      </Text>

      <Text variant="body" style={styles.sectionTitle}>
        {t('preferences.theme.title')}
      </Text>
      <View style={styles.group}>
        {themeOptions.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            selected={themePreference === option.value}
            onPress={() => setThemePreference(option.value)}
          />
        ))}
      </View>

      <Text variant="body" style={styles.sectionTitle}>
        {t('preferences.language.title')}
      </Text>
      <View style={styles.group}>
        {languageOptions.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            selected={languagePreference === option.value}
            onPress={() => setLanguagePreference(option.value)}
          />
        ))}
      </View>
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
});
