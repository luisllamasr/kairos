import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { formatExperienceRange } from '@/lib/experience-dates';
import { ExperienceListItem, isExperienceBecomingMemory } from '@/types/experience';

interface Props {
  item: ExperienceListItem;
  locale: string;
  cancelledLabel: string;
  becomingMemoryLabel: string;
  onPress: () => void;
}

export function ExperienceListRow({
  item,
  locale,
  cancelledLabel,
  becomingMemoryLabel,
  onPress,
}: Props) {
  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const range = formatExperienceRange(item.starts_at, item.ends_at, localeTag);
  const isCancelled = item.status === 'cancelled';
  const isBecomingMemory = isExperienceBecomingMemory(item);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.textBlock}>
        <Text variant="body" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="caption">{range}</Text>
        {item.location_name ? (
          <Text variant="caption" numberOfLines={1}>
            {item.location_name}
          </Text>
        ) : null}
        {isCancelled ? (
          <Text variant="caption" style={styles.statusHint}>
            {cancelledLabel}
          </Text>
        ) : null}
        {isBecomingMemory ? (
          <Text variant="caption" style={styles.statusHint}>
            {becomingMemoryLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.3)',
  },
  pressed: {
    opacity: 0.7,
  },
  textBlock: {
    gap: Spacing.xs,
  },
  statusHint: {
    fontStyle: 'italic',
  },
});
