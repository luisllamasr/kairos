import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { formatExperienceRange } from '@/lib/experience-dates';
import { MemoryListItem } from '@/types/memory';

interface Props {
  item: MemoryListItem;
  locale: string;
  onPress: () => void;
}

export function MemoryListRow({ item, locale, onPress }: Props) {
  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  const range = formatExperienceRange(
    item.happened_starts_at,
    item.happened_ends_at,
    localeTag,
  );

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
});
