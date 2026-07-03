import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { InsetView } from '@/components/InsetView';

import { Button } from '@/components/Button';
import { IncomingExperienceInvitationRow } from '@/components/IncomingExperienceInvitationRow';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { Text } from '@/components/Text';
import { DISABLE_SCROLL_INSET_ADJUSTMENT, TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import {
  acceptExperienceInvitation,
  declineExperienceInvitation,
  listIncomingExperienceInvitations,
} from '@/lib/experiences';
import { IncomingExperienceInvitation } from '@/types/experience';

const EDGES = TAB_SAFE_AREA_EDGES;

export default function ExperienceInvitationsScreen() {
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [invitations, setInvitations] = useState<IncomingExperienceInvitation[]>([]);
  const [error, setError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setError(false);
    const { data, error: loadError } = await listIncomingExperienceInvitations();
    setInvitations(data);
    setError(loadError);
  }, []);

  const { initialLoading, refresh } = useFocusRefresh(loadInvitations);

  async function runAccept(invitation: IncomingExperienceInvitation) {
    setActionId(invitation.invitation_id);
    const result = await acceptExperienceInvitation(invitation.invitation_id);
    setActionId(null);
    if (result.error) return;
    router.replace({
      pathname: '/(app)/(home)/[id]',
      params: { id: invitation.experience_id },
    });
  }

  async function runDecline(invitation: IncomingExperienceInvitation) {
    setActionId(invitation.invitation_id);
    await declineExperienceInvitation(invitation.invitation_id);
    setActionId(null);
    await refresh();
  }

  const showEmpty = !initialLoading && !error && invitations.length === 0;

  return (
    <InsetView edges={EDGES} style={{ backgroundColor: colors.background }}>
      <FlatList
        data={invitations}
        keyExtractor={(item) => item.invitation_id}
        {...DISABLE_SCROLL_INSET_ADJUSTMENT}
        renderItem={({ item }) => (
          <IncomingExperienceInvitationRow
            invitation={item}
            locale={locale}
            loading={actionId === item.invitation_id}
            onAccept={() => void runAccept(item)}
            onDecline={() => void runDecline(item)}
            onPressExperience={() =>
              router.push({
                pathname: '/(app)/(home)/[id]',
                params: { id: item.experience_id },
              })
            }
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Button
              label={t('experiences.invites.back')}
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />

            <Text variant="title" style={styles.title}>
              {t('experiences.invites.screenTitle')}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {t('experiences.invites.screenSubtitle')}
            </Text>

            <ListLoadingSlot active={initialLoading && invitations.length === 0} />

            {!initialLoading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('experiences.invites.loadError')}</Text>
                <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          showEmpty ? (
            <Text variant="subtitle" style={styles.empty}>
              {t('experiences.invites.empty')}
            </Text>
          ) : null
        }
      />
    </InsetView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.md,
  },
  stateBlock: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  empty: {
    marginTop: Spacing.xl,
    textAlign: 'center',
  },
});
