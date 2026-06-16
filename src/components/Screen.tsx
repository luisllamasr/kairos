import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

interface Props {
  children: ReactNode;
  style?: ViewStyle;
  centered?: boolean;
}

export function Screen({ children, style, centered }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.inner, centered && styles.centered, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
    padding: Spacing.lg,
  },
  centered: {
    justifyContent: 'center',
  },
});
