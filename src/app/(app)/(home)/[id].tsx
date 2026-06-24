import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatExperienceRange } from '@/lib/experience-dates';
import { cancelExperience, deleteExperience, getExperience } from '@/lib/experiences';
import {
  canRemoveExperience,
  Experience,
  isExperienceEnded,
  isExperienceUpcoming,
} from '@/types/experience';

export default function ExperienceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [experience, setExperience] = useState<Experience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';

  const loadExperience = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setExperience(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    const { data, error: loadError } = await getExperience(id);
    setExperience(data);
    setError(loadError);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadExperience();
    }, [loadExperience]),
  );

  const upcoming = experience ? isExperienceUpcoming(experience) : false;
  const ended = experience ? isExperienceEnded(experience) : false;
  const cancelled = experience?.status === 'cancelled';
  const removable = experience ? canRemoveExperience(experience) : false;

  function handleCancelPress() {
    if (!experience || actionLoading) return;

    Alert.alert(t('experiences.cancelConfirm.title'), t('experiences.cancelConfirm.message'), [
      { text: t('experiences.cancelConfirm.keep'), style: 'cancel' },
      {
        text: t('experiences.cancelConfirm.confirm'),
        style: 'destructive',
        onPress: () => {
          void runCancel();
        },
      },
    ]);
  }

  function handleRemovePress() {
    if (!experience || actionLoading) return;

    Alert.alert(t('experiences.removeConfirm.title'), t('experiences.removeConfirm.message'), [
      { text: t('experiences.removeConfirm.keep'), style: 'cancel' },
      {
        text: t('experiences.removeConfirm.confirm'),
        style: 'destructive',
        onPress: () => {
          void runRemove();
        },
      },
    ]);
  }

  async function runCancel() {
    if (!experience) return;
    setActionLoading(true);
    setActionError(null);
    const result = await cancelExperience(experience.id);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.cancel'));
      return;
    }
    await loadExperience();
  }

  async function runRemove() {
    if (!experience) return;
    setActionLoading(true);
    setActionError(null);
    const result = await deleteExperience(experience.id);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.remove'));
      return;
    }
    router.replace('/(app)/(home)');
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Button
        label={t('experiences.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}

      {!loading && (error || !experience) && (
        <View style={styles.stateBlock}>
          <Text variant="error" style={styles.centered}>
            {t('experiences.error.load')}
          </Text>
          <Button label={t('error.retry')} onPress={loadExperience} />
        </View>
      )}

      {!loading && experience && (
        <View style={styles.content}>
          {cancelled ? (
            <Text variant="caption" style={styles.statusBanner}>
              {t('experiences.status.cancelled')}
            </Text>
          ) : null}

          <Text variant="hero" style={styles.title}>
            {experience.title}
          </Text>

          <Text variant="subtitle" style={styles.range}>
            {formatExperienceRange(experience.starts_at, experience.ends_at, localeTag)}
          </Text>

          {experience.location_name ? (
            <Text variant="body" style={styles.body}>
              {experience.location_name}
            </Text>
          ) : null}

          {experience.description ? (
            <Text variant="body" style={styles.body}>
              {experience.description}
            </Text>
          ) : null}

          {upcoming && !cancelled ? (
            <Text variant="caption" style={styles.notice}>
              {t('experiences.detail.transformNotice')}
            </Text>
          ) : null}

          {ended && !cancelled ? (
            <Text variant="caption" style={styles.notice}>
              {t('experiences.detail.endedNotice')}
            </Text>
          ) : null}

          {actionError ? (
            <Text variant="error" style={styles.actionError}>
              {actionError}
            </Text>
          ) : null}

          {upcoming && !cancelled ? (
            <View style={styles.actions}>
              <Button
                label={t('experiences.detail.edit')}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/(home)/[id]/edit',
                    params: { id: experience.id },
                  })
                }
                disabled={actionLoading}
              />
              <Button
                label={t('experiences.detail.cancelPlan')}
                variant="secondary"
                onPress={handleCancelPress}
                loading={actionLoading}
              />
              <Button
                label={t('experiences.detail.remove')}
                variant="secondary"
                onPress={handleRemovePress}
                disabled={actionLoading}
              />
            </View>
          ) : null}

          {cancelled && removable ? (
            <View style={styles.actions}>
              <Button
                label={t('experiences.detail.remove')}
                variant="secondary"
                onPress={handleRemovePress}
                loading={actionLoading}
              />
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  loader: {
    marginTop: Spacing.xl,
    alignSelf: 'center',
  },
  stateBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  centered: {
    textAlign: 'center',
  },
  content: {
    flex: 1,
    gap: Spacing.sm,
  },
  statusBanner: {
    fontStyle: 'italic',
    marginBottom: Spacing.sm,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  range: {
    marginBottom: Spacing.md,
  },
  body: {
    marginBottom: Spacing.sm,
  },
  notice: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionError: {
    marginBottom: Spacing.sm,
  },
  actions: {
    gap: Spacing.sm,
  },
});
