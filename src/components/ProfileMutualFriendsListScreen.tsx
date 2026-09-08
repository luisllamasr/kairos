import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { ProfileFriendIdentityList } from '@/components/ProfileFriendIdentityList';
import { useI18n } from '@/i18n';
import { listMutualFriends } from '@/lib/friendships';

/**
 * Dedicated mutual-friends list for a profile (Privacy v1, docs/PROJECT.md
 * §6), opened by tapping the mutual-friend-count stat on
 * PublicProfileScreen — only shown as pressable there when the viewer is a
 * confirmed friend of the profile owner. Sourced from list_mutual_friends,
 * which independently enforces that same boundary server-side: a non-friend
 * (or the owner viewing their own profile) gets an empty result even if
 * this route is opened directly, so no further client-side gating is needed
 * here either.
 */
export function ProfileMutualFriendsListScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { t } = useI18n();

  const load = useCallback(() => listMutualFriends(username), [username]);

  return (
    <ProfileFriendIdentityList
      title={t('publicProfile.mutualFriendsList.title')}
      emptyLabel={t('publicProfile.mutualFriendsList.empty')}
      errorLabel={t('publicProfile.mutualFriendsList.error')}
      load={load}
    />
  );
}
