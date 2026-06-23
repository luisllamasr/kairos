import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

/** Same edges as tab screens — avoids a top inset jump when bootstrap hands off to Tabs. */
const TAB_EDGES: Edge[] = ['top', 'left', 'right'];

/** Full-screen themed placeholder while auth/session state is still resolving. */
export function BootstrapScreen() {
  const colors = useTheme();

  return (
    <SafeAreaView edges={TAB_EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
