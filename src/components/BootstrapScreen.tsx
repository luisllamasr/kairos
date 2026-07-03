import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { InsetView } from '@/components/InsetView';
import { TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { useTheme } from '@/hooks/use-theme';

/** Same edges as tab screens — avoids a top inset jump when bootstrap hands off to Tabs. */
const TAB_EDGES = TAB_SAFE_AREA_EDGES;

/** Full-screen themed placeholder while auth/session state is still resolving. */
export function BootstrapScreen() {
  const colors = useTheme();

  return (
    <InsetView edges={TAB_EDGES} style={{ backgroundColor: colors.background }}>
      <View style={styles.container}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    </InsetView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
