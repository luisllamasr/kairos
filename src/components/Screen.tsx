import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Edge } from 'react-native-safe-area-context';

import { InsetView } from '@/components/InsetView';
import { Spacing } from '@/constants/theme';
import { DISABLE_SCROLL_INSET_ADJUSTMENT } from '@/constants/layout';
import { useTheme } from '@/hooks/use-theme';

const DEFAULT_EDGES: Edge[] = ['top', 'left', 'right', 'bottom'];

interface Props {
  children: ReactNode;
  // Applied to the content container — use for layout-level overrides only.
  style?: ViewStyle;
  centered?: boolean;
  // Wrap content in a KeyboardAvoidingView + ScrollView. Use on form screens only.
  avoidKeyboard?: boolean;
  // When false, children manage their own scroll (avoids nested ScrollView jank).
  scroll?: boolean;
  // Safe area edges to apply. Tab screens should omit bottom (the tab bar handles it).
  edges?: readonly Edge[];
}

export function Screen({
  children,
  style,
  centered,
  avoidKeyboard = false,
  scroll = true,
  edges = DEFAULT_EDGES,
}: Props) {
  const colors = useTheme();

  // Static centered screens use a flex View — single-pass layout, no ScrollView jump.
  // Form screens keep ScrollView + KeyboardAvoidingView for keyboard scroll behavior.
  const useStaticLayout = (centered && !avoidKeyboard) || !scroll;

  const content = useStaticLayout ? (
    <View
      style={[
        styles.flex,
        !centered && styles.scrollContent,
        centered && styles.padded,
        centered && styles.centered,
        style,
      ]}
    >
      {children}
    </View>
  ) : (
    <ScrollView
      style={avoidKeyboard ? styles.flex : undefined}
      contentContainerStyle={[styles.scrollContent, centered && styles.centered, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...DISABLE_SCROLL_INSET_ADJUSTMENT}
    >
      {children}
    </ScrollView>
  );

  return (
    <InsetView edges={edges} style={{ backgroundColor: colors.background }}>
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
    </InsetView>
  );
}

const styles = StyleSheet.create({
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
