import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { ProfileStatsRow } from '@/components/ProfileStatsRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useCurrentProfileTabGroup } from '@/hooks/use-current-profile-tab-group';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useGuardedPush } from '@/hooks/use-guarded-push';
import { useI18n } from '@/i18n';
import { formatExperienceRange } from '@/lib/experience-dates';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '@/lib/friendships';
import { getAvatarPublicUrl } from '@/lib/profile';
import { listProfileMemories } from '@/lib/public-memories';
import { getPublicProfile } from '@/lib/users';
import { MemoryListItem } from '@/types/memory';
import { PublicProfileWithRelationship } from '@/types/public-profile';
import { RelationshipStatus } from '@/types/relationship';

/**
 * The public-profile screen (Privacy v1, docs/PROJECT.md §6). Lives outside
 * any single tab's route folder — Search, Friends, and Friend Requests each
 * push a thin route under their own tab that re-exports this component, so
 * `router.back()` always returns to the tab the viewer came from rather than
 * always landing in Search. See src/app/(app)/(search)/user/[username].tsx
 * and src/app/(app)/(profile)/user/[username].tsx.
 *
 * The friend-count and mutual-friend-count stats push further into two more
 * shared routes (.../friends and .../mutual-friends, same duplication
 * pattern) — see useCurrentProfileTabGroup for how those pushes stay in the
 * current tab instead of hardcoding one.
 */
export function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { profile: ownProfile } = useAuth();
  const { t, tn, locale } = useI18n();
  const push = useGuardedPush();
  const currentGroup = useCurrentProfileTabGroup();

  const [publicProfile, setPublicProfile] = useState<PublicProfileWithRelationship | null>(null);
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!username || typeof username !== 'string') {
      setNotFound(true);
      setError(false);
      setPublicProfile(null);
      setMemories([]);
      return;
    }

    setError(false);
    setNotFound(false);
    setActionError(false);

    // Memories are fetched alongside the profile itself rather than lazily
    // on demand — listProfileMemories already self-gates visibility
    // server-side (Privacy v1: it returns an empty result for a disallowed
    // viewer rather than an error), so the client never needs to pre-check
    // permission before asking.
    const [{ data, error: loadError }, memoriesResult] = await Promise.all([
      getPublicProfile(username),
      listProfileMemories(username),
    ]);

    if (loadError) {
      setError(true);
      setPublicProfile(null);
    } else if (!data) {
      setNotFound(true);
      setPublicProfile(null);
    } else {
      setPublicProfile(data);
    }

    // Non-fatal — a failure here shouldn't block the rest of the profile
    // from rendering, so it degrades to an empty section rather than an
    // error state of its own.
    setMemories(memoriesResult.error ? [] : memoriesResult.data);
  }, [username]);

  const { initialLoading, refresh, resetLoaded } = useFocusRefresh(loadProfile);

  useEffect(() => {
    resetLoaded();
  }, [username, resetLoaded]);

  const contentProfile =
    publicProfile && publicProfile.username === username ? publicProfile : null;
  const showDetailLoader = initialLoading && !contentProfile;
  const showLoadError = !initialLoading && error;
  const showNotFound = !initialLoading && notFound;

  const isSelf = Boolean(
    contentProfile && ownProfile?.username && contentProfile.username === ownProfile.username,
  );

  const avatarUri = getAvatarPublicUrl(contentProfile?.avatar_url ?? null);
  const relationshipStatus: RelationshipStatus = contentProfile?.relationship_status ?? 'none';
  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';

  async function runFriendshipAction(action: () => Promise<{ ok: boolean; error: boolean }>) {
    if (!contentProfile) return;

    setActionLoading(true);
    setActionError(false);

    const result = await action();
    if (result.error) {
      setActionLoading(false);
      setActionError(true);
      return;
    }

    await refresh();
    setActionLoading(false);
  }

  function handleAddFriend() {
    if (!contentProfile) return;
    void runFriendshipAction(() => sendFriendRequest(contentProfile.username));
  }

  function handleAcceptRequest() {
    if (!contentProfile) return;
    void runFriendshipAction(() => acceptFriendRequest(contentProfile.username));
  }

  function handleDeclineRequest() {
    if (!contentProfile) return;
    void runFriendshipAction(() => declineFriendRequest(contentProfile.username));
  }

  function handleCancelRequest() {
    if (!contentProfile) return;
    void runFriendshipAction(() => cancelFriendRequest(contentProfile.username));
  }

  function handleRemoveFriend() {
    if (!contentProfile || actionLoading) return;

    Alert.alert(t('publicProfile.removeFriend.title'), t('publicProfile.removeFriend.message'), [
      { text: t('publicProfile.removeFriend.cancel'), style: 'cancel' },
      {
        text: t('publicProfile.removeFriend.confirm'),
        style: 'destructive',
        onPress: () => {
          void runFriendshipAction(() => removeFriend(contentProfile.username));
        },
      },
    ]);
  }

  function renderFriendshipActions() {
    if (!contentProfile || isSelf) return null;

    switch (relationshipStatus) {
      case 'none':
        return (
          <Button
            label={t('publicProfile.addFriend')}
            onPress={handleAddFriend}
            loading={actionLoading}
            style={styles.actionButton}
          />
        );
      case 'pending_outgoing':
        return (
          <View style={styles.actionGroup}>
            <Text variant="body" style={styles.centeredText}>
              {t('publicProfile.requestSent')}
            </Text>
            <Button
              label={t('publicProfile.cancelRequest')}
              variant="secondary"
              onPress={handleCancelRequest}
              loading={actionLoading}
              style={styles.actionButton}
            />
          </View>
        );
      case 'pending_incoming':
        return (
          <View style={styles.actionGroup}>
            <Button
              label={t('publicProfile.acceptRequest')}
              onPress={handleAcceptRequest}
              loading={actionLoading}
              style={styles.actionButton}
            />
            <Button
              label={t('publicProfile.declineRequest')}
              variant="secondary"
              onPress={handleDeclineRequest}
              disabled={actionLoading}
              style={styles.actionButton}
            />
          </View>
        );
      case 'friends':
        return (
          <View style={styles.actionGroup}>
            <Text variant="body" style={styles.centeredText}>
              {t('publicProfile.friends')}
            </Text>
            <Button
              label={t('publicProfile.removeFriend')}
              variant="secondary"
              onPress={handleRemoveFriend}
              loading={actionLoading}
              style={styles.actionButton}
            />
          </View>
        );
      default:
        return null;
    }
  }

  function pushToFriendsList() {
    if (!contentProfile) return;
    push({
      pathname:
        currentGroup === '(profile)'
          ? '/(app)/(profile)/user/[username]/friends'
          : '/(app)/(search)/user/[username]/friends',
      params: { username: contentProfile.username },
    });
  }

  function pushToMutualFriendsList() {
    if (!contentProfile) return;
    push({
      pathname:
        currentGroup === '(profile)'
          ? '/(app)/(profile)/user/[username]/mutual-friends'
          : '/(app)/(search)/user/[username]/mutual-friends',
      params: { username: contentProfile.username },
    });
  }

  function renderStats() {
    if (!contentProfile) return null;

    // Friend-list access is gated server-side (list_profile_friends)
    // regardless of what the client does — this is defense in depth, not
    // the only boundary. But a stat that's tappable and opens an empty
    // screen for a non-friend still reads as broken, so the pressable
    // affordance itself is also gated client-side to the same "self or
    // confirmed friend" condition as the access rule.
    const canOpenFriends = isSelf || relationshipStatus === 'friends';

    // Same component, same order, same styling as the self Profile screen
    // (Friends, then Memories) — see ProfileStatsRow. Mutual-friend count
    // is relationship context, not an identity stat, so it renders
    // separately below — see renderMutualFriendsLine.
    return (
      <ProfileStatsRow
        stats={[
          {
            key: 'friends',
            value: contentProfile.friend_count,
            label: t('profile.stats.friends'),
            onPress: canOpenFriends ? pushToFriendsList : undefined,
          },
          { key: 'memories', value: contentProfile.visible_memory_count, label: t('profile.stats.memories') },
        ]}
      />
    );
  }

  function renderMutualFriendsLine() {
    // NULL on the self-profile case (mutual-with-self is meaningless) — the
    // null check alone already excludes self, but isSelf is checked too so
    // the intent ("never on self, never reserving space for it") is
    // explicit rather than incidental to the RPC's null convention.
    if (!contentProfile || isSelf || contentProfile.mutual_friend_count === null) return null;

    const count = contentProfile.mutual_friend_count;
    const label = tn('publicProfile.mutualFriendsCount.other', count);
    const canOpenMutual = relationshipStatus === 'friends';

    if (canOpenMutual) {
      return (
        <Pressable
          accessibilityRole="button"
          onPress={pushToMutualFriendsList}
          style={({ pressed }) => [styles.mutualFriendsLine, pressed && styles.pressed]}
        >
          <Text variant="caption">{label}</Text>
        </Pressable>
      );
    }

    return (
      <View style={styles.mutualFriendsLine}>
        <Text variant="caption">{label}</Text>
      </View>
    );
  }

  function renderMemoriesList() {
    return (
      <View style={styles.section}>
        <Text variant="title" style={styles.sectionTitle}>
          {t('publicProfile.memoriesList.title')}
        </Text>
        {memories.length === 0 ? (
          // Deliberately neutral — must not reveal *why* nothing is shown
          // (no memories at all vs. only_me vs. friends vs. every memory
          // individually hidden from this profile all render identically).
          <Text variant="body" style={styles.memoriesEmpty}>
            {t('publicProfile.memoriesList.empty')}
          </Text>
        ) : (
          memories.map((memory) => (
            // Informational only — no chevron, press state, or navigation.
            // Public memory detail is a separate, later slice.
            <View key={memory.id} style={styles.memoryRow}>
              <Text variant="body" numberOfLines={2}>
                {memory.title}
              </Text>
              <Text variant="caption">
                {formatExperienceRange(memory.happened_starts_at, memory.happened_ends_at, localeTag)}
              </Text>
              {memory.location_name ? (
                <Text variant="caption" numberOfLines={1}>
                  {memory.location_name}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Button
        label={t('publicProfile.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      <DetailLoadingSlot active={showDetailLoader} />

      {showLoadError && (
        <View style={styles.stateBlock}>
          <Text variant="error" style={styles.centeredText}>
            {t('publicProfile.loadError')}
          </Text>
          <Button
            label={t('error.retry')}
            onPress={() => void refresh({ showLoading: true })}
            style={styles.retryButton}
          />
        </View>
      )}

      {showNotFound && (
        <View style={styles.stateBlock}>
          <Text variant="title" style={styles.centeredText}>
            {t('publicProfile.notFound')}
          </Text>
          <Text variant="subtitle" style={styles.centeredText}>
            {t('publicProfile.notFoundHint')}
          </Text>
        </View>
      )}

      {contentProfile && (
        <View style={styles.profileBlock}>
          <View style={styles.identityBlock}>
            <Avatar
              uri={avatarUri}
              displayName={contentProfile.display_name}
              size={88}
              style={styles.avatar}
            />
            <Text variant="hero" style={styles.centeredText}>
              {contentProfile.display_name ?? contentProfile.username}
            </Text>
            <Text variant="subtitle" style={styles.username}>
              @{contentProfile.username}
            </Text>
          </View>

          <View style={styles.statsSection}>
            {renderStats()}
            {renderMutualFriendsLine()}
          </View>

          <View style={styles.actionBlock}>
            {isSelf && (
              <View style={styles.selfBlock}>
                <Text variant="body" style={styles.centeredText}>
                  {t('publicProfile.isSelf')}
                </Text>
                <Button
                  label={t('publicProfile.goToProfile')}
                  variant="secondary"
                  onPress={() => router.replace('/(app)/(profile)')}
                  style={styles.goProfileButton}
                />
              </View>
            )}

            {renderFriendshipActions()}

            {actionError && (
              <Text variant="error" style={styles.actionError}>
                {t('publicProfile.actionError')}
              </Text>
            )}
          </View>

          {renderMemoriesList()}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  loader: {
    marginTop: Spacing.xl,
    alignSelf: 'center',
  },
  stateBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  profileBlock: {
    flex: 1,
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.sm,
  },
  identityBlock: {
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  avatar: {
    alignSelf: 'center',
  },
  username: {
    textAlign: 'center',
  },
  // Wraps the primary stats row plus the mutual-friends line below it, so
  // the gap before the next block (relationship action) is identical
  // whether or not the mutual-friends line renders — self profiles skip
  // that line entirely rather than leaving a reserved blank gap for it.
  statsSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  // Relationship context, not an identity stat — deliberately smaller and
  // subtler than the primary stats row, sitting directly beneath it.
  // marginBottom is negative on purpose: it only affects the space *below
  // this line* (pulling it back from statsSection's own fixed
  // marginBottom below), so the self-profile case — which never renders
  // this line at all — keeps its original, untouched spacing before the
  // action block. Net effect: roughly equal space above and below this
  // line, centering it between the stats row and the section beneath.
  mutualFriendsLine: {
    marginTop: Spacing.lg,
    marginBottom: -Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  actionBlock: {
    width: '100%',
    alignItems: 'center',
  },
  selfBlock: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  goProfileButton: {
    marginTop: Spacing.sm,
  },
  actionGroup: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionButton: {
    alignSelf: 'stretch',
  },
  actionError: {
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  section: {
    width: '100%',
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  memoryRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.3)',
    gap: Spacing.xs,
  },
  memoriesEmpty: {
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
});
