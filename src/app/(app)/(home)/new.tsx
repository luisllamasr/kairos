import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ExperienceForm } from '@/components/ExperienceForm';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { createExperience } from '@/lib/experiences';

export default function NewExperienceScreen() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: Parameters<typeof createExperience>[0]) {
    setLoading(true);
    setError(null);

    const { data, error: createError } = await createExperience(values);
    setLoading(false);

    if (createError || !data) {
      setError(t('experiences.error.create'));
      return;
    }

    router.replace({
      pathname: '/(app)/(home)/[id]',
      params: { id: data },
    });
  }

  return (
    <Screen avoidKeyboard edges={['top', 'left', 'right']}>
      <Text variant="title" style={styles.title}>
        {t('experiences.create.title')}
      </Text>

      <ExperienceForm
        submitLabel={t('experiences.create.submit')}
        loading={loading}
        showFriendInvites
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />

      {error ? (
        <Text variant="error" style={styles.error}>
          {error}
        </Text>
      ) : null}
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
