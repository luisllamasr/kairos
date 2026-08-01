import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { ExperienceActionsFooter } from '@/components/ExperienceActionsFooter';
import { ExperienceChatEntryCard } from '@/components/ExperienceChatEntryCard';
import { ExperienceParticipantsSection } from '@/components/ExperienceParticipantsSection';
import { ExperiencePendingInvitesSection } from '@/components/ExperiencePendingInvitesSection';
import { ExperiencePendingSuggestionsSection } from '@/components/ExperiencePendingSuggestionsSection';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { DISABLE_SCROLL_INSET_ADJUSTMENT } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useExperienceDetail } from '@/hooks/use-experience-detail';
import { useGuardedPush } from '@/hooks/use-guarded-push';
import { useI18n } from '@/i18n';
import { formatExperienceRange } from '@/lib/experience-dates';
import { ExperienceBatchSocialResult } from '@/lib/experiences';
import {
  experienceParticipantDisplayName,
  ExperienceInvitation,
  ExperienceInviteSuggestion,
  ExperienceParticipant,
} from '@/types/experience';

export default function ExperienceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { t, locale } = useI18n();
  const push = useGuardedPush();
  const myUserId = session?.user.id ?? null;
  const experienceId = typeof id === 'string' ? id : null;

  const detail = useExperienceDetail(experienceId);

  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';

  const {
    experience,
    participants,
    contentExperience,
    initialLoading,
    error,
    actionLoading,
    actionError,
    upcoming,
    ended,
    cancelled,
    editable,
    cancellable,
    manageable,
    leavable,
    leaveNeedsSuccessor,
    leaveDeletesPlan,
    revivable,
    invitesOpen,
    pendingInvitee,
    isMember,
    chatAccessible,
    pendingInvitations,
    pendingSuggestions,
    excludeFriendIds,
  } = detail;

  const showDetailLoader = initialLoading && !contentExperience;
  const showDetailError = !initialLoading && !contentExperience && (error || !experience);
  const successorCandidates = participants.filter((p) => p.user_id !== myUserId);

  function participantLabel(participant: ExperienceParticipant): string {
    return experienceParticipantDisplayName(participant, t('experiences.participants.unknown'));
  }

  function handleCancelPress() {
    if (!experience || actionLoading) return;

    Alert.alert(t('experiences.cancelConfirm.title'), t('experiences.cancelConfirm.message'), [
      { text: t('experiences.cancelConfirm.keep'), style: 'cancel' },
      {
        text: t('experiences.cancelConfirm.confirm'),
        style: 'destructive',
        onPress: () => {
          void detail.cancel(t('experiences.error.cancel'));
        },
      },
    ]);
  }

  function handleLeave() {
    if (!experience || actionLoading) return;

    Alert.alert(t('experiences.leaveConfirm.title'), t('experiences.leaveConfirm.message'), [
      { text: t('experiences.leaveConfirm.cancel'), style: 'cancel' },
      {
        text: t('experiences.leaveConfirm.confirm'),
        style: 'destructive',
        onPress: () => {
          void detail.leave(t('experiences.error.leave'));
        },
      },
    ]);
  }

  function handleLeaveLastParticipant() {
    if (!experience || actionLoading) return;

    Alert.alert(
      t('experiences.leaveConfirm.lastParticipantTitle'),
      t('experiences.leaveConfirm.lastParticipantMessage'),
      [
        { text: t('experiences.leaveConfirm.cancel'), style: 'cancel' },
        {
          text: t('experiences.leaveConfirm.lastParticipantConfirm'),
          style: 'destructive',
          onPress: () => {
            void detail.leave(t('experiences.error.leave'));
          },
        },
      ],
    );
  }

  function handleLeaveWithSuccessor(successorUserId: string) {
    if (!experience || actionLoading) return;
    void detail.leave(t('experiences.error.leave'), successorUserId);
  }

  function handleRevivePress() {
    if (!experience || actionLoading) return;

    Alert.alert(t('experiences.reviveConfirm.title'), t('experiences.reviveConfirm.message'), [
      { text: t('experiences.reviveConfirm.cancel'), style: 'cancel' },
      {
        text: t('experiences.reviveConfirm.confirm'),
        onPress: () => {
          void detail.revive(t('experiences.error.revive'));
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
            void detail.removeParticipant(
              participant.user_id,
              t('experiences.error.removeParticipant'),
            );
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
            void detail.transferLeadership(participant.user_id, t('experiences.error.transfer'));
          },
        },
      ],
    );
  }

  function inviteErrorLabel(errorCode?: string): string {
    switch (errorCode) {
      case 'invite blocked':
        return t('experiences.error.inviteBlocked');
      case 'invite pending':
        return t('experiences.error.invitePending');
      case 'already participant':
        return t('experiences.error.alreadyParticipant');
      case 'not friends with leader':
      case 'not friends':
        return t('experiences.error.notFriends');
      default:
        return t('experiences.error.invite');
    }
  }

  function suggestErrorLabel(errorCode?: string): string {
    switch (errorCode) {
      case 'suggestion pending':
        return t('experiences.error.suggestPending');
      case 'invite pending':
        return t('experiences.error.invitePending');
      case 'already participant':
        return t('experiences.error.alreadyParticipant');
      case 'invite blocked':
        return t('experiences.error.inviteBlocked');
      case 'not friends':
        return t('experiences.error.notFriends');
      default:
        return t('experiences.error.suggest');
    }
  }

  function reviewSuggestionErrorLabel(errorCode?: string): string {
    switch (errorCode) {
      case 'invite pending':
        return t('experiences.error.reviewSuggestionInvitePending');
      case 'invite blocked':
        return t('experiences.error.inviteBlocked');
      default:
        return t('experiences.error.reviewSuggestion');
    }
  }

  function formatPartialBatchMessage(
    kind: 'invite' | 'suggest',
    sent: number,
    failed: number,
  ): string {
    const params = { sent: String(sent), failed: String(failed) };
    if (kind === 'invite') {
      if (sent === 1 && failed === 1) return t('experiences.error.invitePartial.oneOne');
      if (sent === 1) return t('experiences.error.invitePartial.oneOther', params);
      if (failed === 1) return t('experiences.error.invitePartial.otherOne', params);
      return t('experiences.error.invitePartial.otherOther', params);
    }
    if (sent === 1 && failed === 1) return t('experiences.error.suggestPartial.oneOne');
    if (sent === 1) return t('experiences.error.suggestPartial.oneOther', params);
    if (failed === 1) return t('experiences.error.suggestPartial.otherOne', params);
    return t('experiences.error.suggestPartial.otherOther', params);
  }

  function formatInviteBatchError(result: ExperienceBatchSocialResult): string | null {
    if (result.error) return inviteErrorLabel(result.errorCode);
    if (result.failures.length === 0) return null;
    if (result.sent.length === 0 && result.failures.length === 1) {
      return inviteErrorLabel(result.failures[0]!.errorCode);
    }
    if (result.sent.length === 0) return t('experiences.error.inviteBatchFailed');
    return formatPartialBatchMessage('invite', result.sent.length, result.failures.length);
  }

  function formatSuggestBatchError(result: ExperienceBatchSocialResult): string | null {
    if (result.error) return suggestErrorLabel(result.errorCode);
    if (result.failures.length === 0) return null;
    if (result.sent.length === 0 && result.failures.length === 1) {
      return suggestErrorLabel(result.failures[0]!.errorCode);
    }
    if (result.sent.length === 0) return t('experiences.error.suggestBatchFailed');
    return formatPartialBatchMessage('suggest', result.sent.length, result.failures.length);
  }

  async function runReviewSuggestion(suggestionId: string, approve: boolean) {
    await detail.reviewSuggestion(suggestionId, approve, reviewSuggestionErrorLabel);
  }

  function handleWithdrawInvitationPress(invitation: ExperienceInvitation) {
    if (actionLoading) return;
    const name = experienceParticipantDisplayName(
      invitation,
      t('experiences.participants.unknown'),
    );
    Alert.alert(
      t('experiences.invites.withdrawConfirm.title'),
      t('experiences.invites.withdrawConfirm.message', { name }),
      [
        { text: t('experiences.invites.withdrawConfirm.cancel'), style: 'cancel' },
        {
          text: t('experiences.invites.withdrawConfirm.confirm'),
          style: 'destructive',
          onPress: () => {
            void detail.withdrawInvitation(
              invitation.invitation_id,
              t('experiences.error.withdrawInvite'),
            );
          },
        },
      ],
    );
  }

  function handleWithdrawSuggestionPress(suggestion: ExperienceInviteSuggestion) {
    if (actionLoading) return;
    void detail.withdrawSuggestion(
      suggestion.suggestion_id,
      t('experiences.error.withdrawSuggestion'),
    );
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
          <Button
            label={t('error.retry')}
            onPress={() => void detail.refresh({ showLoading: true })}
          />
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

          <ExperienceParticipantsSection
            participants={participants}
            cancelled={!!cancelled}
            showActions={isMember && manageable}
            myUserId={myUserId}
            actionLoading={actionLoading}
            title={t('experiences.participants.title')}
            leaderLabel={t('experiences.participants.leader')}
            unknownLabel={t('experiences.participants.unknown')}
            onTransfer={handleTransferParticipantPress}
            onRemove={handleRemoveParticipantPress}
          />

          {isMember && chatAccessible ? (
            <ExperienceChatEntryCard
              title={t('experiences.chat.sectionTitle')}
              lead={t('experiences.chat.sectionLead')}
              hint={t('experiences.chat.sectionHint')}
              onPress={() =>
                push({
                  pathname: '/(app)/(home)/[id]/chat',
                  params: { id: contentExperience.id },
                })
              }
            />
          ) : null}

          {isMember ? (
            <ExperiencePendingInvitesSection
              invitations={pendingInvitations}
              title={t('experiences.invites.pendingTitle')}
              pendingStatusLabel={t('experiences.invites.pendingStatus')}
              unknownLabel={t('experiences.participants.unknown')}
              withdrawLabel={t('experiences.invites.withdraw')}
              canWithdraw={manageable}
              actionLoading={actionLoading}
              onWithdraw={(invitationId) => {
                const invitation = pendingInvitations.find(
                  (item) => item.invitation_id === invitationId,
                );
                if (invitation) handleWithdrawInvitationPress(invitation);
              }}
            />
          ) : null}

          {isMember ? (
            <ExperiencePendingSuggestionsSection
              suggestions={pendingSuggestions}
              title={t('experiences.suggestions.pendingTitle')}
              approveLabel={t('experiences.suggestions.approve')}
              rejectLabel={t('experiences.suggestions.reject')}
              withdrawLabel={t('experiences.suggestions.withdraw')}
              canReview={manageable}
              myUserId={myUserId}
              actionLoading={actionLoading}
              formatRow={(suggestion) =>
                t('experiences.suggestions.row', {
                  suggester:
                    suggestion.suggester_display_name ??
                    suggestion.suggester_username ??
                    t('experiences.participants.unknown'),
                  friend:
                    suggestion.suggested_display_name ??
                    suggestion.suggested_username ??
                    t('experiences.participants.unknown'),
                })
              }
              onApprove={(suggestionId) => void runReviewSuggestion(suggestionId, true)}
              onReject={(suggestionId) => void runReviewSuggestion(suggestionId, false)}
              onWithdraw={(suggestionId) => {
                const suggestion = pendingSuggestions.find(
                  (item) => item.suggestion_id === suggestionId,
                );
                if (suggestion) handleWithdrawSuggestionPress(suggestion);
              }}
            />
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

          <ExperienceActionsFooter
            pendingInvitee={!!pendingInvitee}
            isMember={isMember}
            editable={editable}
            manageable={manageable}
            invitesOpen={invitesOpen}
            cancelled={!!cancelled}
            cancellable={cancellable}
            leavable={leavable}
            leaveNeedsSuccessor={leaveNeedsSuccessor}
            leaveDeletesPlan={leaveDeletesPlan}
            revivable={revivable}
            notificationsMuted={contentExperience.notifications_muted}
            actionLoading={actionLoading}
            excludeFriendIds={excludeFriendIds}
            successorCandidates={successorCandidates}
            onAcceptInvitation={() => void detail.acceptInvitation(t('experiences.detail.invitationAcceptError'))}
            onDeclineInvitation={() => void detail.declineInvitation(t('experiences.detail.invitationDeclineError'))}
            onEdit={() =>
              push({
                pathname: '/(app)/(home)/[id]/edit',
                params: { id: contentExperience.id },
              })
            }
            onSendInvites={(friendIds) => detail.sendInvites(friendIds, formatInviteBatchError)}
            onSuggestInvites={(friendIds) =>
              detail.suggestInvites(friendIds, formatSuggestBatchError)
            }
            onToggleMute={() => void detail.toggleMute(t('experiences.error.mute'))}
            onCancelPress={handleCancelPress}
            onLeave={handleLeave}
            onLeaveLastParticipant={handleLeaveLastParticipant}
            onLeaveWithSuccessor={handleLeaveWithSuccessor}
            onRevivePress={handleRevivePress}
          />
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
  notice: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionError: {
    marginBottom: Spacing.sm,
  },
});
