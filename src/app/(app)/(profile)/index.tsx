import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ListLoadingSlot } from '@/components/ListLoadingSlot';
import { MemoryListRow } from '@/components/MemoryListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TAB_SCREEN_EDGES } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { countMyFriends, listIncomingFriendRequests } from '@/lib/friendships';
import { listMyMemories, transformMyDueExperiences } from '@/lib/memories';
import { getAvatarPublicUrl } from '@/lib/profile';
import { MemoryListItem } from '@/types/memory';

export default function ProfileScreen() {
  const { profile } = useAuth();
  const { t, locale } = useI18n();
  const colors = useTheme();

  const [incomingRequestCount, setIncomingRequestCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [memoriesError, setMemoriesError] = useState(false);

  const avatarUri = getAvatarPublicUrl(profile?.avatar_url ?? null);

  const loadProfile = useCallback(async () => {
    setMemoriesError(false);

    const [requestsResult, friendsResult] = await Promise.all([
      listIncomingFriendRequests(),
      countMyFriends(),
    ]);

    await transformMyDueExperiences();
    const memoriesResult = await listMyMemories();

    if (!requestsResult.error) {
      setIncomingRequestCount(requestsResult.data.length);
    }
    if (!friendsResult.error) {
      setFriendCount(friendsResult.count);
    }

    if (memoriesResult.error) {
      setMemories([]);
      setMemoriesError(true);
    } else {
      setMemories(memoriesResult.data);
      setMemoriesError(false);
    }
  }, []);

  const { initialLoading, refresh } = useFocusRefresh(loadProfile);

  return (
    <Screen edges={TAB_SCREEN_EDGES} style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.open')}
          onPress={() => router.push('/(app)/(profile)/settings')}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.header}>
        <Avatar
          uri={avatarUri}
          displayName={profile?.display_name}
          size={88}
          style={styles.avatar}
        />
        <Text variant="hero" style={styles.name}>
          {profile?.display_name}
        </Text>
        <Text variant="subtitle" style={styles.username}>
          @{profile?.username}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text variant="title">{initialLoading ? '—' : memories.length}</Text>
            <Text variant="caption">{t('profile.stats.memories')}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/(profile)/friends')}
            style={({ pressed }) => [styles.stat, styles.statPressable, pressed && styles.pressed]}
          >
            <Text variant="title">{initialLoading ? '—' : friendCount}</Text>
            <Text variant="caption">{t('profile.stats.friends')}</Text>
          </Pressable>
        </View>

        <Button
          label={t('profile.editProfile')}
          onPress={() => router.push('/(app)/(profile)/edit-profile')}
          style={styles.editButton}
        />

        {incomingRequestCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/(profile)/friend-requests')}
            style={({ pressed }) => [styles.requestsLink, pressed && styles.pressed]}
          >
            <Text variant="body" style={{ color: colors.brand }}>
              {t('profile.friendRequestsWithCount', {
                count: String(incomingRequestCount),
              })}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.memoriesSection}>
        <View style={styles.sectionHeader}>
          <Text variant="title">{t('profile.memoriesSection.title')}</Text>
          {memories.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/(profile)/memories')}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text variant="caption" style={{ color: colors.brand }}>
                {t('profile.memoriesSection.search')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <ListLoadingSlot active={initialLoading && memories.length === 0} />

        {!initialLoading && memoriesError ? (
          <View style={styles.inlineState}>
            <Text variant="error">{t('memories.loadError')}</Text>
            <Pressable
              onPress={() => void refresh({ showLoading: true })}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text variant="body" style={{ color: colors.brand }}>
                {t('error.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!initialLoading && !memoriesError && memories.length === 0 ? (
          <Text variant="subtitle" style={styles.emptyMemories}>
            {t('profile.memoriesSection.empty')}
          </Text>
        ) : null}

        {memories.length > 0
          ? memories.map((item) => (
              <MemoryListRow
                key={item.id}
                item={item}
                locale={locale}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/(profile)/memories/[id]',
                    params: { id: item.id },
                  })
                }
              />
            ))
          : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: Spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Spacing.sm,
  },
  topBarSide: {
    flex: 1,
  },
  settingsButton: {
    padding: Spacing.xs,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    marginBottom: Spacing.lg,
  },
  name: {
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  username: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxl,
    marginBottom: Spacing.lg,
  },
  stat: {
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 72,
  },
  statPressable: {
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  editButton: {
    alignSelf: 'stretch',
    marginBottom: Spacing.sm,
  },
  requestsLink: {
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  memoriesSection: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  memoriesLoader: {
    marginVertical: Spacing.lg,
  },
  inlineState: {
    gap: Spacing.sm,
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  emptyMemories: {
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
