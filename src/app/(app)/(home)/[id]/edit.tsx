import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { ExperienceForm } from '@/components/ExperienceForm';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useI18n } from '@/i18n';
import { CreateExperienceInput, getExperience, updateExperience } from '@/lib/experiences';
import { Experience, canEditExperience } from '@/types/experience';

export default function EditExperienceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();

  const [experience, setExperience] = useState<Experience | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExperience = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setExperience(null);
      return;
    }

    setError(null);

    const { data, error: loadError } = await getExperience(id);
    if (loadError || !data) {
      setError(t('experiences.error.load'));
      setExperience(null);
    } else if (!canEditExperience(data)) {
      setError(t('experiences.error.notUpcoming'));
      setExperience(null);
    } else {
      setExperience(data);
    }
  }, [id, t]);

  const { initialLoading, resetLoaded } = useFocusRefresh(loadExperience);

  useEffect(() => {
    resetLoaded();
  }, [id, resetLoaded]);

  const contentExperience = experience?.id === id ? experience : null;
  const showDetailLoader = initialLoading && !contentExperience;
  const showLoadError = !initialLoading && Boolean(error);

  async function handleSubmit(values: CreateExperienceInput) {
    if (!experience) return;

    setSaving(true);
    setError(null);

    const result = await updateExperience({
      ...values,
      id: experience.id,
      expectedUpdatedAt: experience.updated_at,
    });
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

      <DetailLoadingSlot active={showDetailLoader} />

      {showLoadError && (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      )}

      {contentExperience && (
        <ExperienceForm
          initialValues={{
            title: contentExperience.title,
            description: contentExperience.description,
            locationName: contentExperience.location_name,
            startsAt: contentExperience.starts_at,
            endsAt: contentExperience.ends_at,
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
  error: {
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});
