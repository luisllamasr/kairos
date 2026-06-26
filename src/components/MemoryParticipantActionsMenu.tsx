import { Alert, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';

interface Props {
  participantName: string;
  disabled?: boolean;
  onTransfer: () => void;
}

export function MemoryParticipantActionsMenu({
  participantName,
  disabled = false,
  onTransfer,
}: Props) {
  const { t } = useI18n();
  const colors = useTheme();

  function openMenu() {
    if (disabled) return;

    Alert.alert(participantName, undefined, [
      {
        text: t('memories.detail.transferLeadership'),
        onPress: onTransfer,
      },
      {
        text: t('memories.participants.menuCancel'),
        style: 'cancel',
      },
    ]);
  }

  return (
    <Pressable
      onPress={openMenu}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressed && !disabled && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('memories.participants.openMenu', { name: participantName })}
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
