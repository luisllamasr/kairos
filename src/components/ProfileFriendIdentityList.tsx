import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { InsetView } from '@/components/InsetView';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { Text } from '@/components/Text';
import { UserSearchResult } from '@/components/UserSearchResult';
import { DISABLE_SCROLL_INSET_ADJUSTMENT, TAB_SAFE_AREA_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useCurrentProfileTabGroup } from '@/hooks/use-current-profile-tab-group';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useGuardedPush } from '@/hooks/use-guarded-push';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { PublicProfile } from '@/types/public-profile';

const EDGES = TAB_SAFE_AREA_EDGES;

interface Props {
  title: string;
  emptyLabel: string;
  errorLabel: string;
  load: () => Promise<{ data: PublicProfile[]; error: boolean }>;
}

/**
 * Shared list UI behind the profile-friends and mutual-friends dedicated
 * screens (Privacy v1, docs/PROJECT.md §6). Both mirror the self "Friends"
 * screen's UX (src/app/(app)/(profile)/friends.tsx), just sourced from a
 * different RPC via `load`. Not a route itself — each caller
 * (ProfileFriendsListScreen / ProfileMutualFriendsListScreen) is re-exported
 * under both the Search and Profile tabs, same shared-route pattern as
 * PublicProfileScreen, so Back returns to whichever tab the viewer came
 * from.
 */
export function ProfileFriendIdentityList({ title, emptyLabel, errorLabel, load }: Props) {
  const { t } = useI18n();
  const colors = useTheme();
  const push = useGuardedPush();
  const currentGroup = useCurrentProfileTabGroup();

  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [error, setError] = useState(false);

  const loadFriends = useCallback(async () => {
    setError(false);
    const { data, error: loadError } = await load();
    setFriends(data);
    setError(loadError);
  }, [load]);

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
                pathname:
                  currentGroup === '(profile)'
                    ? '/(app)/(profile)/user/[username]'
                    : '/(app)/(search)/user/[username]',
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
              label={t('publicProfile.back')}
              variant="secondary"
              onPress={() => router.back()}
              style={styles.backButton}
            />

            <Text variant="title" style={styles.title}>
              {title}
            </Text>

            <ListLoadingSlot active={initialLoading && friends.length === 0} />

            {!initialLoading && error && (
              <View style={styles.stateBlock}>
                <Text variant="error" style={styles.message}>
                  {errorLabel}
                </Text>
                <Button label={t('error.retry')} onPress={() => void refresh({ showLoading: true })} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          showEmpty ? (
            <Text variant="subtitle" style={styles.message}>
              {emptyLabel}
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
