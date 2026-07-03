import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Edge, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

const BOOT_INSETS = initialWindowMetrics?.insets ?? {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

function paddingForEdges(
  edges: readonly Edge[],
  insets: { top: number; bottom: number; left: number; right: number },
): ViewStyle {
  return {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };
}

interface Props {
  children: ReactNode;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
}

/**
 * JS-applied safe area padding using boot-time insets.
 * Avoids NativeSafeAreaView applying native insets on a later pass when a tab scene
 * first mounts.
 */
export function InsetView({
  children,
  edges = ['top', 'left', 'right', 'bottom'],
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const stableInsets = {
    top: Math.max(insets.top, BOOT_INSETS.top),
    bottom: Math.max(insets.bottom, BOOT_INSETS.bottom),
    left: Math.max(insets.left, BOOT_INSETS.left),
    right: Math.max(insets.right, BOOT_INSETS.right),
  };

  return (
    <View style={[{ flex: 1 }, paddingForEdges(edges, stableInsets), style]}>{children}</View>
  );
}
