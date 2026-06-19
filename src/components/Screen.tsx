import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right', 'bottom'];

interface Props {
  children: ReactNode;
  // Applied to the content container — use for layout-level overrides only.
  style?: ViewStyle;
  centered?: boolean;
  // Wrap content in a KeyboardAvoidingView + ScrollView. Use on form screens only.
  avoidKeyboard?: boolean;
  // Safe area edges to apply. Tab screens should omit bottom (the tab bar handles it).
  edges?: Edge[];
}

export function Screen({
  children,
  style,
  centered,
  avoidKeyboard = false,
  edges = DEFAULT_EDGES,
}: Props) {
  const colors = useTheme();

  // Static centered screens use a flex View — single-pass layout, no ScrollView jump.
  // Form screens keep ScrollView + KeyboardAvoidingView for keyboard scroll behavior.
  const useStaticLayout = centered && !avoidKeyboard;

  const content = useStaticLayout ? (
    <View style={[styles.flex, styles.padded, styles.centered, style]}>{children}</View>
  ) : (
    <ScrollView
      style={avoidKeyboard ? styles.flex : undefined}
      contentContainerStyle={[styles.scrollContent, centered && styles.centered, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: colors.background }]}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  padded: {
    padding: Spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  centered: {
    justifyContent: 'center',
  },
});
