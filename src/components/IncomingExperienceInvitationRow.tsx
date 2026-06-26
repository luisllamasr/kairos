import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { formatExperienceDateTime } from '@/lib/experience-dates';
import { IncomingExperienceInvitation } from '@/types/experience';

interface Props {
  invitation: IncomingExperienceInvitation;
  locale: string;
  loading?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onPressExperience: () => void;
}

export function IncomingExperienceInvitationRow({
  invitation,
  locale,
  loading = false,
  onAccept,
  onDecline,
  onPressExperience,
}: Props) {
  const { t } = useI18n();
  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const inviterName =
    invitation.inviter_display_name ?? invitation.inviter_username ?? t('experiences.invites.unknownUser');
  const range = formatExperienceDateTime(invitation.starts_at, localeTag);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPressExperience}
        style={({ pressed }) => [styles.contentPress, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text variant="body" numberOfLines={2}>
          {t('experiences.invites.incomingTitle', {
            title: invitation.experience_title,
            name: inviterName,
          })}
        </Text>
        <Text variant="caption">{range}</Text>
      </Pressable>

      <View style={styles.actions}>
        <Button
          label={t('experiences.invites.accept')}
          onPress={onAccept}
          loading={loading}
          style={styles.actionButton}
        />
        <Button
          label={t('experiences.invites.decline')}
          variant="secondary"
          onPress={onDecline}
          disabled={loading}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.3)',
  },
  contentPress: {
    gap: Spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
