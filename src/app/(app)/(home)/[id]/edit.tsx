import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ExperienceForm } from '@/components/ExperienceForm';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { CreateExperienceInput, getExperience, updateExperience } from '@/lib/experiences';
import { Experience, isExperienceUpcoming } from '@/types/experience';

export default function EditExperienceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useTheme();

  const [experience, setExperience] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExperience = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setExperience(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: loadError } = await getExperience(id);
    if (loadError || !data) {
      setError(t('experiences.error.load'));
      setExperience(null);
    } else if (!isExperienceUpcoming(data)) {
      setError(t('experiences.error.notUpcoming'));
      setExperience(null);
    } else {
      setExperience(data);
    }

    setLoading(false);
  }, [id, t]);

  useEffect(() => {
    void loadExperience();
  }, [loadExperience]);

  async function handleSubmit(values: CreateExperienceInput) {
    if (!experience) return;

    setSaving(true);
    setError(null);

    const result = await updateExperience({ ...values, id: experience.id });
    setSaving(false);

    if (result.error) {
      setError(t('experiences.error.update'));
      return;
    }

    router.back();
  }

  return (
    <Screen avoidKeyboard edges={['top', 'left', 'right']}>
      <Text variant="title" style={styles.title}>
        {t('experiences.edit.title')}
      </Text>

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}

      {!loading && error && (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      )}

      {!loading && experience && (
        <ExperienceForm
          initialValues={{
            title: experience.title,
            description: experience.description,
            locationName: experience.location_name,
            startsAt: experience.starts_at,
            endsAt: experience.ends_at,
          }}
          submitLabel={t('experiences.edit.submit')}
          loading={saving}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: Spacing.lg,
  },
  loader: {
    marginTop: Spacing.xl,
    alignSelf: 'center',
  },
  error: {
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});
