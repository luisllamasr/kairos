import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';

interface Props {
  /** Display names of everyone currently typing, oldest first. May be empty. */
  names: string[];
}

/**
 * Fixed-height row. It always occupies the same space whether or not anyone is
 * typing, so the indicator appearing and disappearing never shifts the message
 * list or its scroll position.
 */
export function TypingIndicator({ names }: Props) {
  const { t } = useI18n();

  // A sender can omit or blank its name; never render an empty slot.
  const someone = t('experiences.chat.typing.someone');
  const labels = names.map((name) => name || someone);

  let label: string | null = null;
  if (labels.length === 1) {
    label = t('experiences.chat.typing.single', { name: labels[0] });
  } else if (labels.length === 2) {
    label = t('experiences.chat.typing.pair', { first: labels[0], second: labels[1] });
  } else if (labels.length > 2) {
    label = t('experiences.chat.typing.many');
  }

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      {label ? (
        <Text variant="caption" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  label: {
    fontStyle: 'italic',
  },
});
