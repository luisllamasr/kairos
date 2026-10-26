import { Alert, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

interface Props {
  participantName: string;
  disabled?: boolean;
  showTransfer?: boolean;
  showRemove?: boolean;
  onTransfer: () => void;
  onRemove: () => void;
}

export function ExperienceParticipantActionsMenu({
  participantName,
  disabled = false,
  showTransfer = true,
  showRemove = true,
  onTransfer,
  onRemove,
}: Props) {
  const { t } = useI18n();
  const colors = useTheme();

  function openMenu() {
    if (disabled) return;

    const buttons: {
      text: string;
      onPress?: () => void;
      style?: 'cancel' | 'destructive';
    }[] = [];
    if (showTransfer) {
      buttons.push({
        text: t('experiences.detail.transferLeadership'),
        onPress: onTransfer,
      });
    }
    if (showRemove) {
      buttons.push({
        text: t('experiences.participants.remove'),
        style: 'destructive',
        onPress: onRemove,
      });
    }
    buttons.push({
      text: t('experiences.participants.menuCancel'),
      style: 'cancel',
    });

    Alert.alert(participantName, undefined, buttons);
  }

  return (
    <Pressable
      onPress={openMenu}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressed && !disabled && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('experiences.participants.openMenu', { name: participantName })}
      hitSlop={8}
    >
      <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
