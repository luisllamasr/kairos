import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { InsetView } from '@/components/InsetView';

import { Button } from '@/components/Button';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { Text } from '@/components/Text';
import { UserSearchResult } from '@/components/UserSearchResult';
import { DISABLE_SCROLL_INSET_ADJUSTMENT, TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useGuardedPush } from '@/hooks/use-guarded-push';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { listFriends } from '@/lib/friendships';
import { PublicProfile } from '@/types/public-profile';

const EDGES = TAB_SAFE_AREA_EDGES;

export default function FriendsScreen() {
  const { t } = useI18n();
  const colors = useTheme();
  const push = useGuardedPush();

  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [error, setError] = useState(false);

  const loadFriends = useCallback(async () => {
    setError(false);

    const { data, error: loadError } = await listFriends();
    setFriends(data);
    setError(loadError);
  }, []);

  const { initialLoading, refresh } = useFocusRefresh(loadFriends);

  const showEmpty = !initialLoading && !error && friends.length === 0;

  return (
    <InsetView edges={EDGES} style={{ backgroundColor: colors.background }}>
      <FlatList
        data={friends}
        keyExtractor={(item) => item.username}
        {...DISABLE_SCROLL_INSET_ADJUSTMENT}
        renderItem={({ item }) => (
          <UserSearchResult
            profile={item}
            onPress={() =>
              push({
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
              label={t('friends.back')}
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />

            <Text variant="title" style={styles.title}>
              {t('friends.title')}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {t('friends.subtitle')}
            </Text>

            <ListLoadingSlot active={initialLoading && friends.length === 0} />

            {!initialLoading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error" style={styles.message}>
                  {t('friends.error')}
                </Text>
                <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          showEmpty ? (
            <Text variant="subtitle" style={styles.message}>
              {t('friends.empty')}
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
  message: {
    marginTop: Spacing.xl,
    textAlign: 'center',
  },
});
