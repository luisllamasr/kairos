import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { ExperienceFriendPicker } from '@/components/ExperienceFriendPicker';
import { ExperienceParticipantActionsMenu } from '@/components/ExperienceParticipantActionsMenu';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { DISABLE_SCROLL_INSET_ADJUSTMENT } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { formatExperienceRange } from '@/lib/experience-dates';
import {
  acceptExperienceInvitation,
  cancelExperience,
  declineExperienceInvitation,
  deleteExperience,
  getExperience,
  leaveExperience,
  listExperienceInvitations,
  listExperienceInviteSuggestions,
  listExperienceParticipants,
  removeExperienceParticipant,
  reviewExperienceInviteSuggestion,
  reviveExperience,
  sendExperienceInvitation,
  setExperienceNotificationsMuted,
  suggestExperienceInvite,
  transferExperienceLeadership,
} from '@/lib/experiences';
import { ensureExperienceTransformed } from '@/lib/memories';
import { getAvatarPublicUrl } from '@/lib/profile';
import {
  canCancelExperience,
  canEditExperience,
  canLeaveExperienceNow,
  canManageExperienceParticipants,
  canRemoveExperience,
  canReviveExperience,
  Experience,
  ExperienceInvitation,
  ExperienceInviteSuggestion,
  ExperienceParticipant,
  experienceParticipantDisplayName,
  hasActiveExperienceLeader,
  isExperienceEnded,
  isExperienceUpcoming,
  isPendingExperienceInvitee,
} from '@/types/experience';

export default function ExperienceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const colors = useTheme();
  const myUserId = session?.user.id ?? null;

  const [experience, setExperience] = useState<Experience | null>(null);
  const [participants, setParticipants] = useState<ExperienceParticipant[]>([]);
  const [invitations, setInvitations] = useState<ExperienceInvitation[]>([]);
  const [suggestions, setSuggestions] = useState<ExperienceInviteSuggestion[]>([]);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [showSuggestPicker, setShowSuggestPicker] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';

  const excludeFriendIds = useMemo(() => {
    const ids = new Set(participants.map((p) => p.user_id));
    invitations
      .filter((inv) => inv.status === 'pending')
      .forEach((inv) => ids.add(inv.invitee_id));
    return Array.from(ids);
  }, [participants, invitations]);

  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

  const loadExperience = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setExperience(null);
      return;
    }

    setError(false);

    const { data, error: loadError } = await getExperience(id);
    if (loadError || !data) {
      setExperience(null);
      setParticipants([]);
      setInvitations([]);
      setSuggestions([]);
      setError(loadError);
      return;
    }

    const ended = isExperienceEnded(data);
    const cancelled = data.status === 'cancelled';

    if (ended && !cancelled) {
      const { data: memoryId, error: transformError } = await ensureExperienceTransformed(id);
      if (memoryId) {
        router.replace({
          pathname: '/(app)/(profile)/memories/[id]',
          params: { id: memoryId },
        });
        return;
      }
      if (transformError) {
        setExperience(data);
        setError(true);
        return;
      }
    }

    const [participantsResult, invitationsResult, suggestionsResult] = await Promise.all([
      listExperienceParticipants(id),
      data.am_organizer && data.am_participant && data.status === 'planned'
        ? listExperienceInvitations(id)
        : Promise.resolve({ data: [], error: false }),
      data.am_organizer && data.am_participant && data.status === 'planned'
        ? listExperienceInviteSuggestions(id)
        : Promise.resolve({ data: [], error: false }),
    ]);

    setExperience(data);
    setParticipants(participantsResult.data);
    setInvitations(invitationsResult.data);
    setSuggestions(suggestionsResult.data);
    setError(participantsResult.error);
  }, [id]);

  const { initialLoading, refresh, resetLoaded } = useFocusRefresh(loadExperience);

  useEffect(() => {
    resetLoaded();
  }, [id, resetLoaded]);

  const contentExperience = experience?.id === id ? experience : null;
  const showDetailLoader = initialLoading && !contentExperience;
  const showDetailError = !initialLoading && !contentExperience && (error || !experience);

  const upcoming = experience ? isExperienceUpcoming(experience) : false;
  const ended = experience ? isExperienceEnded(experience) : false;
  const cancelled = experience?.status === 'cancelled';
  const removable = experience ? canRemoveExperience(experience) : false;
  const editable = experience ? canEditExperience(experience) : false;
  const cancellable = experience ? canCancelExperience(experience) : false;
  const manageable = experience ? canManageExperienceParticipants(experience) : false;
  const leavable = experience ? canLeaveExperienceNow(experience, participants.length) : false;
  const revivable = experience ? canReviveExperience(experience) : false;
  const invitesOpen = experience ? upcoming && hasActiveExperienceLeader(experience) : false;
  const pendingInvitee = experience ? isPendingExperienceInvitee(experience) : false;
  const isMember = experience?.am_participant ?? false;

  function participantLabel(participant: ExperienceParticipant): string {
    return experienceParticipantDisplayName(participant, t('experiences.participants.unknown'));
  }

  function otherParticipantsExcludingSelf(): ExperienceParticipant[] {
    return participants.filter((p) => p.user_id !== myUserId);
  }

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

  function handleLeavePress() {
    if (!experience || actionLoading) return;

    const successorCandidates = otherParticipantsExcludingSelf();

    if (
      hasActiveExperienceLeader(experience) &&
      experience.am_organizer &&
      successorCandidates.length > 0
    ) {
      Alert.alert(
        t('experiences.leaveConfirm.leaderMustTransferTitle'),
        t('experiences.leaveConfirm.leaderMustTransferMessage'),
        [{ text: t('experiences.leaveConfirm.leaderMustTransferOk') }],
      );
      return;
    }

    Alert.alert(t('experiences.leaveConfirm.title'), t('experiences.leaveConfirm.message'), [
      { text: t('experiences.leaveConfirm.cancel'), style: 'cancel' },
      {
        text: t('experiences.leaveConfirm.confirm'),
        style: 'destructive',
        onPress: () => {
          void runLeave();
        },
      },
    ]);
  }

  function handleRevivePress() {
    if (!experience || actionLoading) return;

    Alert.alert(t('experiences.reviveConfirm.title'), t('experiences.reviveConfirm.message'), [
      { text: t('experiences.reviveConfirm.cancel'), style: 'cancel' },
      {
        text: t('experiences.reviveConfirm.confirm'),
        onPress: () => {
          void runRevive();
        },
      },
    ]);
  }

  function handleRemoveParticipantPress(participant: ExperienceParticipant) {
    if (!experience || actionLoading) return;

    Alert.alert(
      t('experiences.removeParticipantConfirm.title'),
      t('experiences.removeParticipantConfirm.message', { name: participantLabel(participant) }),
      [
        { text: t('experiences.removeParticipantConfirm.cancel'), style: 'cancel' },
        {
          text: t('experiences.removeParticipantConfirm.confirm'),
          style: 'destructive',
          onPress: () => {
            void runRemoveParticipant(participant.user_id);
          },
        },
      ],
    );
  }

  function handleTransferParticipantPress(participant: ExperienceParticipant) {
    if (!experience || actionLoading) return;

    Alert.alert(
      t('experiences.transferConfirm.title'),
      t('experiences.transferConfirm.messageTo', { name: participantLabel(participant) }),
      [
        { text: t('experiences.transferConfirm.cancel'), style: 'cancel' },
        {
          text: t('experiences.transferConfirm.confirm'),
          onPress: () => {
            void runTransfer(participant.user_id);
          },
        },
      ],
    );
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
    await refresh();
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

  async function runLeave(newOrganizerId?: string) {
    if (!experience) return;
    setActionLoading(true);
    setActionError(null);
    const result = await leaveExperience(experience.id, newOrganizerId);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.leave'));
      return;
    }
    router.replace('/(app)/(home)');
  }

  async function runRevive() {
    if (!experience) return;
    setActionLoading(true);
    setActionError(null);
    const result = await reviveExperience(experience.id);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.revive'));
      return;
    }
    await refresh();
  }

  async function runRemoveParticipant(userId: string) {
    if (!experience) return;
    setActionLoading(true);
    setActionError(null);
    const result = await removeExperienceParticipant(experience.id, userId);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.removeParticipant'));
      return;
    }
    await refresh();
  }

  async function runTransfer(newOrganizerId: string) {
    if (!experience) return;
    setActionLoading(true);
    setActionError(null);
    const result = await transferExperienceLeadership(experience.id, newOrganizerId);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.transfer'));
      return;
    }
    await refresh();
  }

  async function runSendInvite() {
    if (!experience || selectedFriendIds.length !== 1) return;
    setActionLoading(true);
    setActionError(null);
    const result = await sendExperienceInvitation(experience.id, selectedFriendIds[0]!);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.invite'));
      return;
    }
    setSelectedFriendIds([]);
    setShowInvitePicker(false);
    await refresh();
  }

  async function runSuggestInvite() {
    if (!experience || selectedFriendIds.length !== 1) return;
    setActionLoading(true);
    setActionError(null);
    const result = await suggestExperienceInvite(experience.id, selectedFriendIds[0]!);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.suggest'));
      return;
    }
    setSelectedFriendIds([]);
    setShowSuggestPicker(false);
    await refresh();
  }

  async function runReviewSuggestion(suggestionId: string, approve: boolean) {
    setActionLoading(true);
    setActionError(null);
    const result = await reviewExperienceInviteSuggestion(suggestionId, approve);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.reviewSuggestion'));
      return;
    }
    await refresh();
  }

  async function runToggleMute() {
    if (!experience || !isMember) return;
    setActionLoading(true);
    setActionError(null);
    const result = await setExperienceNotificationsMuted(
      experience.id,
      !experience.notifications_muted,
    );
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.error.mute'));
      return;
    }
    await refresh();
  }

  async function runAcceptInvitation() {
    if (!experience?.pending_invitation_id) return;
    setActionLoading(true);
    setActionError(null);
    const result = await acceptExperienceInvitation(experience.pending_invitation_id);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.detail.invitationAcceptError'));
      return;
    }
    await refresh();
  }

  async function runDeclineInvitation() {
    if (!experience?.pending_invitation_id) return;
    setActionLoading(true);
    setActionError(null);
    const result = await declineExperienceInvitation(experience.pending_invitation_id);
    setActionLoading(false);
    if (result.error) {
      setActionError(t('experiences.detail.invitationDeclineError'));
      return;
    }
    router.replace('/(app)/(home)/invitations');
  }

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <Button
        label={t('experiences.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      <DetailLoadingSlot active={showDetailLoader} />

      {showDetailError && (
        <View style={styles.stateBlock}>
          <Text variant="error" style={styles.centered}>
            {t('experiences.error.load')}
          </Text>
          <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
        </View>
      )}

      {contentExperience && (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          {...DISABLE_SCROLL_INSET_ADJUSTMENT}
        >
          {cancelled ? (
            <Text variant="caption" style={styles.statusBanner}>
              {t('experiences.status.cancelled')}
            </Text>
          ) : null}

          <Text variant="hero" style={styles.title}>
            {contentExperience.title}
          </Text>

          <Text variant="subtitle" style={styles.range}>
            {formatExperienceRange(contentExperience.starts_at, contentExperience.ends_at, localeTag)}
          </Text>

          {contentExperience.location_name ? (
            <Text variant="body" style={styles.body}>
              {contentExperience.location_name}
            </Text>
          ) : null}

          {contentExperience.description ? (
            <Text variant="body" style={styles.body}>
              {contentExperience.description}
            </Text>
          ) : null}

          {participants.length > 0 ? (
            <View style={styles.section}>
              <Text variant="title" style={styles.sectionTitle}>
                {t('experiences.participants.title')}
              </Text>
              {participants.map((participant) => (
                <View key={participant.participant_id} style={styles.participantRow}>
                  <Avatar
                    uri={getAvatarPublicUrl(participant.avatar_url)}
                    displayName={participantLabel(participant)}
                    size={40}
                  />
                  <View style={styles.participantText}>
                    <Text variant="body">{participantLabel(participant)}</Text>
                    {participant.is_organizer && !cancelled ? (
                      <Text variant="caption">{t('experiences.participants.leader')}</Text>
                    ) : null}
                  </View>
                  {isMember && manageable && !participant.is_organizer && participant.user_id !== myUserId ? (
                    <ExperienceParticipantActionsMenu
                      participantName={participantLabel(participant)}
                      disabled={actionLoading}
                      onTransfer={() => handleTransferParticipantPress(participant)}
                      onRemove={() => handleRemoveParticipantPress(participant)}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {manageable && pendingInvitations.length > 0 ? (
            <View style={styles.section}>
              <Text variant="title" style={styles.sectionTitle}>
                {t('experiences.invites.pendingTitle')}
              </Text>
              {pendingInvitations.map((invitation) => (
                <View key={invitation.invitation_id} style={styles.inviteRow}>
                  <Text variant="body">
                    {experienceParticipantDisplayName(
                      invitation,
                      t('experiences.participants.unknown'),
                    )}
                  </Text>
                  <Text variant="caption">{t('experiences.invites.pendingStatus')}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {manageable && pendingSuggestions.length > 0 ? (
            <View style={styles.section}>
              <Text variant="title" style={styles.sectionTitle}>
                {t('experiences.suggestions.pendingTitle')}
              </Text>
              {pendingSuggestions.map((suggestion) => (
                <View key={suggestion.suggestion_id} style={styles.suggestionRow}>
                  <Text variant="body">
                    {t('experiences.suggestions.row', {
                      suggester:
                        suggestion.suggester_display_name ??
                        suggestion.suggester_username ??
                        t('experiences.participants.unknown'),
                      friend:
                        suggestion.suggested_display_name ??
                        suggestion.suggested_username ??
                        t('experiences.participants.unknown'),
                    })}
                  </Text>
                  <View style={styles.suggestionActions}>
                    <Button
                      label={t('experiences.suggestions.approve')}
                      onPress={() => void runReviewSuggestion(suggestion.suggestion_id, true)}
                      disabled={actionLoading}
                      style={styles.inlineAction}
                    />
                    <Button
                      label={t('experiences.suggestions.reject')}
                      variant="secondary"
                      onPress={() => void runReviewSuggestion(suggestion.suggestion_id, false)}
                      disabled={actionLoading}
                      style={styles.inlineAction}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {pendingInvitee ? (
            <Text variant="caption" style={styles.notice}>
              {t('experiences.detail.invitationNotice')}
            </Text>
          ) : null}

          {upcoming && !cancelled && !pendingInvitee ? (
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

          <View style={styles.actions}>
            {pendingInvitee ? (
              <>
                <Button
                  label={t('experiences.invites.accept')}
                  onPress={() => void runAcceptInvitation()}
                  loading={actionLoading}
                />
                <Button
                  label={t('experiences.invites.decline')}
                  variant="secondary"
                  onPress={() => void runDeclineInvitation()}
                  disabled={actionLoading}
                />
              </>
            ) : null}

            {isMember && editable ? (
              <Button
                label={t('experiences.detail.edit')}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/(home)/[id]/edit',
                    params: { id: contentExperience.id },
                  })
                }
                disabled={actionLoading}
              />
            ) : null}

            {isMember && manageable && invitesOpen ? (
              <>
                <Button
                  label={
                    showInvitePicker
                      ? t('experiences.invites.hidePicker')
                      : t('experiences.invites.inviteFriend')
                  }
                  variant="secondary"
                  onPress={() => {
                    setShowInvitePicker((open) => !open);
                    setShowSuggestPicker(false);
                    setSelectedFriendIds([]);
                  }}
                  disabled={actionLoading}
                />
                {showInvitePicker ? (
                  <View style={styles.pickerBlock}>
                    <ExperienceFriendPicker
                      selectedIds={selectedFriendIds}
                      onChange={setSelectedFriendIds}
                      multiple={false}
                      excludeUserIds={excludeFriendIds}
                    />
                    <Button
                      label={t('experiences.invites.send')}
                      onPress={() => void runSendInvite()}
                      loading={actionLoading}
                      disabled={selectedFriendIds.length !== 1}
                    />
                  </View>
                ) : null}
              </>
            ) : null}

            {isMember && !manageable && invitesOpen ? (
              <>
                <Button
                  label={
                    showSuggestPicker
                      ? t('experiences.invites.hidePicker')
                      : t('experiences.suggestions.suggestFriend')
                  }
                  variant="secondary"
                  onPress={() => {
                    setShowSuggestPicker((open) => !open);
                    setShowInvitePicker(false);
                    setSelectedFriendIds([]);
                  }}
                  disabled={actionLoading}
                />
                {showSuggestPicker ? (
                  <View style={styles.pickerBlock}>
                    <ExperienceFriendPicker
                      selectedIds={selectedFriendIds}
                      onChange={setSelectedFriendIds}
                      multiple={false}
                      excludeUserIds={excludeFriendIds}
                    />
                    <Button
                      label={t('experiences.suggestions.submit')}
                      onPress={() => void runSuggestInvite()}
                      loading={actionLoading}
                      disabled={selectedFriendIds.length !== 1}
                    />
                  </View>
                ) : null}
              </>
            ) : null}

            {isMember && !cancelled ? (
              <Button
                label={
                  contentExperience.notifications_muted
                    ? t('experiences.notifications.unmute')
                    : t('experiences.notifications.mute')
                }
                variant="secondary"
                onPress={() => void runToggleMute()}
                disabled={actionLoading}
              />
            ) : null}

            {isMember && cancellable ? (
              <Button
                label={t('experiences.detail.cancelPlan')}
                variant="secondary"
                onPress={handleCancelPress}
                loading={actionLoading}
              />
            ) : null}

            {isMember && leavable ? (
              <Button
                label={t('experiences.detail.leave')}
                variant="secondary"
                onPress={handleLeavePress}
                loading={actionLoading}
              />
            ) : null}

            {isMember && revivable ? (
              <Button label={t('experiences.detail.revive')} onPress={handleRevivePress} loading={actionLoading} />
            ) : null}

            {isMember && removable ? (
              <Button
                label={t('experiences.detail.remove')}
                variant="secondary"
                onPress={handleRemovePress}
                disabled={actionLoading}
              />
            ) : null}
          </View>
        </ScrollView>
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
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
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
  section: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  participantText: {
    flex: 1,
    gap: Spacing.xs,
  },
  inviteRow: {
    gap: Spacing.xs,
  },
  suggestionRow: {
    gap: Spacing.sm,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  inlineAction: {
    alignSelf: 'flex-start',
  },
  pickerBlock: {
    gap: Spacing.sm,
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
    marginTop: Spacing.md,
  },
});
