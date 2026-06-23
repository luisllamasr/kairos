import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { IncomingFriendRequestRow } from '@/components/IncomingFriendRequestRow';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import {
  acceptFriendRequest,
  declineFriendRequest,
  listIncomingFriendRequests,
} from '@/lib/friendships';
import { IncomingFriendRequest } from '@/types/public-profile';

const EDGES: Edge[] = ['top', 'left', 'right'];

export default function FriendRequestsScreen() {
  const { t } = useI18n();
  const colors = useTheme();

  const [requests, setRequests] = useState<IncomingFriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionUsername, setActionUsername] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(false);

    const { data, error: loadError } = await listIncomingFriendRequests();
    setRequests(data);
    setError(loadError);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests]),
  );

  async function handleAccept(username: string) {
    setActionUsername(username);
    const result = await acceptFriendRequest(username);
    setActionUsername(null);
    if (!result.error) await loadRequests();
  }

  async function handleDecline(username: string) {
    setActionUsername(username);
    const result = await declineFriendRequest(username);
    setActionUsername(null);
    if (!result.error) await loadRequests();
  }

  const showEmpty = !loading && !error && requests.length === 0;

  return (
    <SafeAreaView edges={EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.username}
        renderItem={({ item }) => (
          <IncomingFriendRequestRow
            request={item}
            loading={actionUsername === item.username}
            onAccept={() => handleAccept(item.username)}
            onDecline={() => handleDecline(item.username)}
            onPressProfile={() =>
              router.push({
                pathname: '/(app)/(search)/user/[username]',
                params: { username: item.username },
              })
            }
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Button
              label={t('friendRequests.back')}
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />

            <Text variant="title" style={styles.title}>
              {t('friendRequests.title')}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {t('friendRequests.subtitle')}
            </Text>

            {loading && (
              <View style={styles.centeredRow}>
                <ActivityIndicator color={colors.brand} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('friendRequests.error')}</Text>
                <Button label={t('error.retry')} onPress={loadRequests} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          showEmpty ? (
            <Text variant="subtitle" style={styles.empty}>
              {t('friendRequests.empty')}
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
  },
  centeredRow: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  stateBlock: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  empty: {
    marginTop: Spacing.xl,
    textAlign: 'center',
  },
});
