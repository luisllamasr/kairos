import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ExperienceParticipantActionsMenu } from '@/components/ExperienceParticipantActionsMenu';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { getAvatarPublicUrl } from '@/lib/profile';
import {
  experienceParticipantDisplayName,
  ExperienceParticipant,
} from '@/types/experience';

interface Props {
  participants: ExperienceParticipant[];
  cancelled: boolean;
  showActions: boolean;
  myUserId: string | null;
  actionLoading: boolean;
  title: string;
  leaderLabel: string;
  unknownLabel: string;
  onTransfer: (participant: ExperienceParticipant) => void;
  onRemove: (participant: ExperienceParticipant) => void;
}

export function ExperienceParticipantsSection({
  participants,
  cancelled,
  showActions,
  myUserId,
  actionLoading,
  title,
  leaderLabel,
  unknownLabel,
  onTransfer,
  onRemove,
}: Props) {
  if (participants.length === 0) return null;

  function labelFor(participant: ExperienceParticipant): string {
    return experienceParticipantDisplayName(participant, unknownLabel);
  }

  return (
    <View style={styles.section}>
      <Text variant="title" style={styles.sectionTitle}>
        {title}
      </Text>
      {participants.map((participant) => {
        const name = labelFor(participant);
        const canActOnRow =
          showActions && !participant.is_organizer && participant.user_id !== myUserId;

        return (
          <View key={participant.participant_id} style={styles.participantRow}>
            <Avatar
              uri={getAvatarPublicUrl(participant.avatar_url)}
              displayName={name}
              size={40}
            />
            <View style={styles.participantText}>
              <Text variant="body">{name}</Text>
              {participant.is_organizer && !cancelled ? (
                <Text variant="caption">{leaderLabel}</Text>
              ) : null}
            </View>
            {canActOnRow ? (
              <ExperienceParticipantActionsMenu
                participantName={name}
                disabled={actionLoading}
                onTransfer={() => onTransfer(participant)}
                onRemove={() => onRemove(participant)}
              />
            ) : null}
          </View>
        );
      })}
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
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  participantText: {
    flex: 1,
    gap: Spacing.xs,
  },
});
