import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import {
  experienceParticipantDisplayName,
  ExperienceInvitation,
} from '@/types/experience';

interface Props {
  invitations: ExperienceInvitation[];
  title: string;
  pendingStatusLabel: string;
  unknownLabel: string;
  withdrawLabel: string;
  /** Leader-only: withdraw a pending invitation. */
  canWithdraw: boolean;
  actionLoading: boolean;
  onWithdraw: (invitationId: string) => void;
}

export function ExperiencePendingInvitesSection({
  invitations,
  title,
  pendingStatusLabel,
  unknownLabel,
  withdrawLabel,
  canWithdraw,
  actionLoading,
  onWithdraw,
}: Props) {
  if (invitations.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text variant="title" style={styles.sectionTitle}>
        {title}
      </Text>
      {invitations.map((invitation) => (
        <View key={invitation.invitation_id} style={styles.inviteRow}>
          <Text variant="body">
            {experienceParticipantDisplayName(invitation, unknownLabel)}
          </Text>
          <Text variant="caption">{pendingStatusLabel}</Text>
          {canWithdraw ? (
            <Button
              label={withdrawLabel}
              variant="secondary"
              onPress={() => onWithdraw(invitation.invitation_id)}
              disabled={actionLoading}
              style={styles.inlineAction}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  inviteRow: {
    gap: Spacing.xs,
  },
  inlineAction: {
    alignSelf: 'flex-start',
  },
});
