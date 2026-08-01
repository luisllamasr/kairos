import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ExperienceInviteFriendPicker } from '@/components/ExperienceInviteFriendPicker';
import { Text } from '@/components/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { getAvatarPublicUrl } from '@/lib/profile';
import {
  experienceParticipantDisplayName,
  ExperienceParticipant,
} from '@/types/experience';

interface Props {
  pendingInvitee: boolean;
  isMember: boolean;
  editable: boolean;
  manageable: boolean;
  invitesOpen: boolean;
  cancelled: boolean;
  cancellable: boolean;
  leavable: boolean;
  leaveNeedsSuccessor: boolean;
  leaveDeletesPlan: boolean;
  revivable: boolean;
  notificationsMuted: boolean;
  actionLoading: boolean;
  excludeFriendIds: string[];
  successorCandidates: ExperienceParticipant[];
  onAcceptInvitation: () => void;
  onDeclineInvitation: () => void;
  onEdit: () => void;
  onSendInvites: (friendIds: string[]) => Promise<boolean>;
  onSuggestInvites: (friendIds: string[]) => Promise<boolean>;
  onToggleMute: () => void;
  onCancelPress: () => void;
  /** Confirmed leave when a successor is not required and others remain. */
  onLeave: () => void;
  /** Confirmed leave when this user is the last participant (plan will be deleted). */
  onLeaveLastParticipant: () => void;
  onLeaveWithSuccessor: (successorUserId: string) => void;
  onRevivePress: () => void;
}

/**
 * Primary action stack on the experience detail screen. Owns leave-successor
 * UI state and nests invite/suggest pickers so expander coordination stays
 * inside this boundary rather than in the screen.
 *
 * Confirmation Alerts stay in the screen (same pattern as chat delete) and
 * are invoked via the leave / cancel / revive callbacks.
 */
export function ExperienceActionsFooter({
  pendingInvitee,
  isMember,
  editable,
  manageable,
  invitesOpen,
  cancelled,
  cancellable,
  leavable,
  leaveNeedsSuccessor,
  leaveDeletesPlan,
  revivable,
  notificationsMuted,
  actionLoading,
  excludeFriendIds,
  successorCandidates,
  onAcceptInvitation,
  onDeclineInvitation,
  onEdit,
  onSendInvites,
  onSuggestInvites,
  onToggleMute,
  onCancelPress,
  onLeave,
  onLeaveLastParticipant,
  onLeaveWithSuccessor,
  onRevivePress,
}: Props) {
  const { t, tn } = useI18n();
  const colors = useTheme();
  const [showLeaveSuccessorPicker, setShowLeaveSuccessorPicker] = useState(false);
  const [selectedSuccessorId, setSelectedSuccessorId] = useState<string | null>(null);

  function closeLeaveSuccessorPicker() {
    setShowLeaveSuccessorPicker(false);
    setSelectedSuccessorId(null);
  }

  function handleLeavePress() {
    if (actionLoading) return;

    if (leaveNeedsSuccessor) {
      setShowLeaveSuccessorPicker((open) => {
        if (open) {
          setSelectedSuccessorId(null);
          return false;
        }
        return true;
      });
      return;
    }

    if (leaveDeletesPlan) {
      onLeaveLastParticipant();
      return;
    }

    onLeave();
  }

  function handleLeaveWithSuccessor() {
    if (!selectedSuccessorId || actionLoading) return;
    onLeaveWithSuccessor(selectedSuccessorId);
  }

  function participantLabel(participant: ExperienceParticipant): string {
    return experienceParticipantDisplayName(participant, t('experiences.participants.unknown'));
  }

  return (
    <View style={styles.actions}>
      {pendingInvitee ? (
        <>
          <Button
            label={t('experiences.invites.accept')}
            onPress={onAcceptInvitation}
            loading={actionLoading}
          />
          <Button
            label={t('experiences.invites.decline')}
            variant="secondary"
            onPress={onDeclineInvitation}
            disabled={actionLoading}
          />
        </>
      ) : null}

      {isMember && editable ? (
        <Button
          label={t('experiences.detail.edit')}
          onPress={onEdit}
          disabled={actionLoading}
        />
      ) : null}

      {isMember && manageable && invitesOpen ? (
        <ExperienceInviteFriendPicker
          openLabel={t('experiences.invites.inviteFriend')}
          hideLabel={t('experiences.invites.hidePicker')}
          submitLabelForCount={(count) => tn('experiences.invites.send.other', count)}
          excludeUserIds={excludeFriendIds}
          actionLoading={actionLoading}
          collapseWhen={showLeaveSuccessorPicker}
          onOpen={closeLeaveSuccessorPicker}
          onSubmit={onSendInvites}
        />
      ) : null}

      {isMember && !manageable && invitesOpen ? (
        <ExperienceInviteFriendPicker
          openLabel={t('experiences.suggestions.suggestFriend')}
          hideLabel={t('experiences.invites.hidePicker')}
          submitLabelForCount={(count) => tn('experiences.suggestions.submit.other', count)}
          excludeUserIds={excludeFriendIds}
          actionLoading={actionLoading}
          collapseWhen={showLeaveSuccessorPicker}
          onOpen={closeLeaveSuccessorPicker}
          onSubmit={onSuggestInvites}
        />
      ) : null}

      {isMember && !cancelled ? (
        <Button
          label={
            notificationsMuted
              ? t('experiences.notifications.unmute')
              : t('experiences.notifications.mute')
          }
          variant="secondary"
          onPress={onToggleMute}
          disabled={actionLoading}
        />
      ) : null}

      {isMember && cancellable ? (
        <Button
          label={t('experiences.detail.cancelPlan')}
          variant="secondary"
          onPress={onCancelPress}
          loading={actionLoading}
        />
      ) : null}

      {isMember && leavable ? (
        <>
          <Button
            label={
              showLeaveSuccessorPicker
                ? t('experiences.leaveConfirm.hideChooser')
                : t('experiences.detail.leave')
            }
            variant="secondary"
            onPress={handleLeavePress}
            loading={actionLoading && !showLeaveSuccessorPicker}
            disabled={actionLoading && showLeaveSuccessorPicker}
          />
          {showLeaveSuccessorPicker ? (
            <View style={styles.pickerBlock}>
              <Text variant="title">{t('experiences.leaveConfirm.chooseLeaderTitle')}</Text>
              <Text variant="caption">{t('experiences.leaveConfirm.chooseLeaderMessage')}</Text>
              {successorCandidates.map((participant) => {
                const selected = selectedSuccessorId === participant.user_id;
                return (
                  <Pressable
                    key={participant.participant_id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={actionLoading}
                    onPress={() => setSelectedSuccessorId(participant.user_id)}
                    style={({ pressed }) => [
                      styles.successorRow,
                      {
                        borderColor: selected ? colors.brand : colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Avatar
                      uri={getAvatarPublicUrl(participant.avatar_url)}
                      displayName={participantLabel(participant)}
                      size={36}
                    />
                    <Text variant="body" style={styles.successorName}>
                      {participantLabel(participant)}
                    </Text>
                  </Pressable>
                );
              })}
              <Button
                label={t('experiences.leaveConfirm.chooseLeaderConfirm')}
                onPress={handleLeaveWithSuccessor}
                loading={actionLoading}
                disabled={!selectedSuccessorId}
              />
            </View>
          ) : null}
        </>
      ) : null}

      {isMember && revivable ? (
        <Button label={t('experiences.detail.revive')} onPress={onRevivePress} loading={actionLoading} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pickerBlock: {
    gap: Spacing.sm,
  },
  successorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  successorName: {
    flex: 1,
  },
});
