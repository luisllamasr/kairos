import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  children: ReactNode;
  // Applied to the ScrollView contentContainerStyle — use for layout-level overrides only.
  style?: ViewStyle;
  centered?: boolean;
}

export function Screen({ children, style, centered }: Props) {
  const colors = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        // 'padding' reduces the KAV height when the keyboard opens, so the ScrollView
        // re-centers its content in the remaining space. This is what makes centered
        // screens (auth) visually shift the content up correctly.
        // 'height' on Android serves the same purpose on that platform.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, centered && styles.centered, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  centered: {
    justifyContent: 'center',
  },
});
