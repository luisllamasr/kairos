import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { ProfileFriendIdentityList } from '@/components/ProfileFriendIdentityList';
import { useI18n } from '@/i18n';
import { listProfileFriends } from '@/lib/friendships';

/**
 * Dedicated friends list for a profile (Privacy v1, docs/PROJECT.md §6),
 * opened by tapping the friend-count stat on PublicProfileScreen. Sourced
 * from list_profile_friends, which already gates identities to the owner
 * themselves or their confirmed friends — this screen renders whatever it
 * returns without any further client-side permission logic.
 */
export function ProfileFriendsListScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { t } = useI18n();

  const load = useCallback(() => listProfileFriends(username), [username]);

  return (
    <ProfileFriendIdentityList
      title={t('publicProfile.friendsList.title')}
      emptyLabel={t('publicProfile.friendsList.empty')}
      errorLabel={t('publicProfile.friendsList.error')}
      load={load}
    />
  );
}
