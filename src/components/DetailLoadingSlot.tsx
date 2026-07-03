import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SLOT_HEIGHT = 56;

interface Props {
  active: boolean;
}

/** Fixed-height detail loader so back buttons and headers stay put during fetch. */
export function DetailLoadingSlot({ active }: Props) {
  const colors = useTheme();

  if (!active) return null;

  return (
    <View style={styles.slot}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    minHeight: SLOT_HEIGHT,
    marginBottom: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
