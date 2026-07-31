import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ExperienceListRow } from '@/components/ExperienceListRow';
import { InsetView } from '@/components/InsetView';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { Text } from '@/components/Text';
import { DISABLE_SCROLL_INSET_ADJUSTMENT, TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { listMyHomeExperiences, listIncomingExperienceInvitations, purgeMyStaleExperiences } from '@/lib/experiences';
import { transformMyDueExperiences } from '@/lib/memories';
import { ExperienceListItem } from '@/types/experience';

const EDGES = TAB_SAFE_AREA_EDGES;

export default function HomeScreen() {
  const { session } = useAuth();
  const { t, tn, locale } = useI18n();
  const colors = useTheme();

  const [experiences, setExperiences] = useState<ExperienceListItem[]>([]);
  const [invitationCount, setInvitationCount] = useState(0);
  const [error, setError] = useState(false);

  const loadExperiences = useCallback(async () => {
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
  }, []);

  const { initialLoading, refresh, resetLoaded } = useFocusRefresh(loadExperiences);

  useEffect(() => {
    resetLoaded();
    setExperiences([]);
    setInvitationCount(0);
    setError(false);
  }, [session?.user.id, resetLoaded]);

  return (
    <InsetView edges={EDGES} style={{ backgroundColor: colors.background }}>
      <FlatList
        data={experiences}
        keyExtractor={(item) => item.id}
        {...DISABLE_SCROLL_INSET_ADJUSTMENT}
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
          <View>
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

            <View style={styles.invitationsSlot}>
              {invitationCount > 0 ? (
                <Button
                  label={tn('home.invitationsCount.other', invitationCount)}
                  variant="secondary"
                  onPress={() => router.push('/(app)/(home)/invitations')}
                />
              ) : null}
            </View>
            {!initialLoading && error ? (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('home.loadError')}</Text>
                <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          initialLoading && experiences.length === 0 ? (
            <ListLoadingSlot active />
          ) : !initialLoading && !error ? (
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
    </InsetView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.md,
  },
  newButton: {
    marginBottom: Spacing.sm,
  },
  invitationsSlot: {
    marginBottom: Spacing.sm,
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
