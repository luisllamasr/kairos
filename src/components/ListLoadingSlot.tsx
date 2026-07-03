import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const SLOT_HEIGHT = 48;

interface Props {
  active: boolean;
}

/** Fixed-height list header slot so spinners do not shift layout when they appear. */
export function ListLoadingSlot({ active }: Props) {
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
    justifyContent: 'center',
    alignItems: 'center',
  },
});
