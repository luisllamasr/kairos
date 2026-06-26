import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { IncomingExperienceInvitationRow } from '@/components/IncomingExperienceInvitationRow';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import {
  acceptExperienceInvitation,
  declineExperienceInvitation,
  listIncomingExperienceInvitations,
} from '@/lib/experiences';
import { IncomingExperienceInvitation } from '@/types/experience';

const EDGES: Edge[] = ['top', 'left', 'right'];

export default function ExperienceInvitationsScreen() {
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [invitations, setInvitations] = useState<IncomingExperienceInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error: loadError } = await listIncomingExperienceInvitations();
    setInvitations(data);
    setError(loadError);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadInvitations();
    }, [loadInvitations]),
  );

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
    await loadInvitations();
  }

  const showEmpty = !loading && !error && invitations.length === 0;

  return (
    <SafeAreaView edges={EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={invitations}
        keyExtractor={(item) => item.invitation_id}
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

            {loading && (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('experiences.invites.loadError')}</Text>
                <Button label={t('error.retry')} onPress={loadInvitations} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: Spacing.lg,
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
  empty: {
    marginTop: Spacing.xl,
    textAlign: 'center',
  },
});
