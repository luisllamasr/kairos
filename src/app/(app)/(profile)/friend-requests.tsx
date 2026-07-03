import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { InsetView } from '@/components/InsetView';

import { Button } from '@/components/Button';
import { IncomingFriendRequestRow } from '@/components/IncomingFriendRequestRow';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { Text } from '@/components/Text';
import { DISABLE_SCROLL_INSET_ADJUSTMENT, TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import {
  acceptFriendRequest,
  declineFriendRequest,
  listIncomingFriendRequests,
} from '@/lib/friendships';
import { IncomingFriendRequest } from '@/types/public-profile';

const EDGES = TAB_SAFE_AREA_EDGES;

export default function FriendRequestsScreen() {
  const { t } = useI18n();
  const colors = useTheme();

  const [requests, setRequests] = useState<IncomingFriendRequest[]>([]);
  const [error, setError] = useState(false);
  const [actionUsername, setActionUsername] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setError(false);

    const { data, error: loadError } = await listIncomingFriendRequests();
    setRequests(data);
    setError(loadError);
  }, []);

  const { initialLoading, refresh } = useFocusRefresh(loadRequests);

  async function handleAccept(username: string) {
    setActionUsername(username);
    const result = await acceptFriendRequest(username);
    setActionUsername(null);
    if (!result.error) await refresh();
  }

  async function handleDecline(username: string) {
    setActionUsername(username);
    const result = await declineFriendRequest(username);
    setActionUsername(null);
    if (!result.error) await refresh();
  }

  const showEmpty = !initialLoading && !error && requests.length === 0;

  return (
    <InsetView edges={EDGES} style={{ backgroundColor: colors.background }}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.username}
        {...DISABLE_SCROLL_INSET_ADJUSTMENT}
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

            <ListLoadingSlot active={initialLoading && requests.length === 0} />

            {!initialLoading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error">{t('friendRequests.error')}</Text>
                <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
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
    </InsetView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.md,
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
