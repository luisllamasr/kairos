import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';

export type ProfileStatItem = {
  key: string;
  value: number | string;
  label: string;
  onPress?: () => void;
};

/**
 * The one canonical "primary identity stats" row — lifted verbatim from the
 * self Profile screen (the pattern that already looked correct at every
 * width, because its captions are always short single words). Shared by
 * the self Profile screen and PublicProfileScreen so the two can never
 * structurally diverge again the way they previously did — any future
 * width/typography fix happens once, here, for both.
 *
 * Deliberately simple: a content-sized row, not a flex-fraction layout.
 * That's safe specifically because callers only pass short captions
 * ("Memories"/"Friends", "Recuerdos"/"Amigos") — see docs/PROJECT.md §6.
 * Do not reuse this for a stat with a longer caption without re-checking
 * that assumption.
 */
// Enlarges the tap target without touching the visible cell's own box —
// see the note on `stat` below for why this exists instead of padding.
const HIT_SLOP = { top: Spacing.xs, bottom: Spacing.xs, left: Spacing.sm, right: Spacing.sm };

export function ProfileStatsRow({ stats }: { stats: ProfileStatItem[] }) {
  return (
    <View style={styles.statsRow}>
      {stats.map((stat) =>
        stat.onPress ? (
          <Pressable
            key={stat.key}
            accessibilityRole="button"
            onPress={stat.onPress}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
          >
            <Text variant="title">{stat.value}</Text>
            <Text variant="caption">{stat.label}</Text>
          </Pressable>
        ) : (
          <View key={stat.key} style={styles.stat}>
            <Text variant="title">{stat.value}</Text>
            <Text variant="caption">{stat.label}</Text>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxl,
  },
  // The one and only cell box — identical for the Pressable and the plain
  // View variant, on purpose. A previous version gave the Pressable
  // variant its own extra padding (meant as a touch-target/press-feedback
  // affordance), which made that cell measurably taller than the plain
  // View cell. Since the row stretches all children to the tallest
  // cell's height (default cross-axis `alignItems: 'stretch'`) but each
  // cell's own content stays top-aligned within its box, the shorter
  // (padding-less) cell's content stayed at the true top while the
  // padded cell's content was pushed down by its own top padding —
  // visibly misaligning the two stats' numbers and captions. Press
  // feedback must never come from geometry that differs between cells;
  // use HIT_SLOP (enlarges the tap target without affecting layout) and
  // the `pressed` opacity style below instead.
  stat: {
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 72,
  },
  pressed: {
    opacity: 0.7,
  },
});
