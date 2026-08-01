import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { ExperienceInviteSuggestion } from '@/types/experience';

interface Props {
  suggestions: ExperienceInviteSuggestion[];
  title: string;
  approveLabel: string;
  rejectLabel: string;
  withdrawLabel: string;
  /** Leader-only: approve/reject controls. Participants see the list read-only
   *  except for withdrawing their own suggestions. */
  canReview: boolean;
  myUserId: string | null;
  actionLoading: boolean;
  formatRow: (suggestion: ExperienceInviteSuggestion) => string;
  onApprove: (suggestionId: string) => void;
  onReject: (suggestionId: string) => void;
  onWithdraw: (suggestionId: string) => void;
}

export function ExperiencePendingSuggestionsSection({
  suggestions,
  title,
  approveLabel,
  rejectLabel,
  withdrawLabel,
  canReview,
  myUserId,
  actionLoading,
  formatRow,
  onApprove,
  onReject,
  onWithdraw,
}: Props) {
  if (suggestions.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text variant="title" style={styles.sectionTitle}>
        {title}
      </Text>
      {suggestions.map((suggestion) => {
        const isAuthor = myUserId !== null && suggestion.suggested_by === myUserId;
        return (
          <View key={suggestion.suggestion_id} style={styles.suggestionRow}>
            <Text variant="body">{formatRow(suggestion)}</Text>
            {canReview ? (
              <View style={styles.suggestionActions}>
                <Button
                  label={approveLabel}
                  onPress={() => onApprove(suggestion.suggestion_id)}
                  disabled={actionLoading}
                  style={styles.inlineAction}
                />
                <Button
                  label={rejectLabel}
                  variant="secondary"
                  onPress={() => onReject(suggestion.suggestion_id)}
                  disabled={actionLoading}
                  style={styles.inlineAction}
                />
              </View>
            ) : isAuthor ? (
              <Button
                label={withdrawLabel}
                variant="secondary"
                onPress={() => onWithdraw(suggestion.suggestion_id)}
                disabled={actionLoading}
                style={styles.inlineAction}
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
});
