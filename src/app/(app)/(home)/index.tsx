import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ExperienceListRow } from '@/components/ExperienceListRow';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { listMyHomeExperiences, listIncomingExperienceInvitations, purgeMyStaleExperiences } from '@/lib/experiences';
import { transformMyDueExperiences } from '@/lib/memories';
import { ExperienceListItem } from '@/types/experience';

const EDGES: Edge[] = ['top', 'left', 'right'];

export default function HomeScreen() {
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [experiences, setExperiences] = useState<ExperienceListItem[]>([]);
  const [invitationCount, setInvitationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadExperiences = useCallback(async () => {
    setLoading(true);
    setError(false);

    await transformMyDueExperiences();
    await purgeMyStaleExperiences();

    const [experiencesResult, invitationsResult] = await Promise.all([
      listMyHomeExperiences(),
      listIncomingExperienceInvitations(),
    ]);
    setExperiences(experiencesResult.data);
    setInvitationCount(invitationsResult.error ? 0 : invitationsResult.data.length);
    setError(experiencesResult.error || invitationsResult.error);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadExperiences();
    }, [loadExperiences]),
  );

  useEffect(() => {
    setExperiences([]);
    setLoading(true);
    setError(false);
  }, [session?.user.id]);

  return (
    <SafeAreaView edges={EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={experiences}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ExperienceListRow
            item={item}
            locale={locale}
            cancelledLabel={t('experiences.status.cancelled')}
            becomingMemoryLabel={t('experiences.status.becomingMemory')}
            onPress={() =>
              router.push({
                pathname: '/(app)/(home)/[id]',
                params: { id: item.id },
              })
            }
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text variant="title" style={styles.title}>
              {t('home.plansTitle')}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {t('home.plansSubtitle')}
            </Text>

            <Button
              label={t('home.newExperience')}
              onPress={() => router.push('/(app)/(home)/new')}
              style={styles.newButton}
            />

            {invitationCount > 0 ? (
              <Button
                label={t('home.invitationsWithCount', { count: String(invitationCount) })}
                variant="secondary"
                onPress={() => router.push('/(app)/(home)/invitations')}
                style={styles.invitationsButton}
              />
            ) : null}

            {loading && (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('home.loadError')}</Text>
                <Button label={t('error.retry')} onPress={loadExperiences} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.emptyBlock}>
              <Text variant="subtitle" style={styles.empty}>
                {t('home.empty')}
              </Text>
              <Text variant="caption" style={styles.emptyHint}>
                {t('home.emptyHint')}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
  },
  newButton: {
    marginBottom: Spacing.lg,
  },
  invitationsButton: {
    marginBottom: Spacing.lg,
  },
  centeredRow: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  stateBlock: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  emptyBlock: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  empty: {
    textAlign: 'center',
  },
  emptyHint: {
    textAlign: 'center',
  },
});
