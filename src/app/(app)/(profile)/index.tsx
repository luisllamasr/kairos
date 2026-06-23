import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { listIncomingFriendRequests } from '@/lib/friendships';
import { getAvatarPublicUrl } from '@/lib/profile';

export default function ProfileScreen() {
  const { profile, signOutAccount } = useAuth();
  const { t } = useI18n();
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);

  const avatarUri = getAvatarPublicUrl(profile?.avatar_url ?? null);

  const loadIncomingRequestCount = useCallback(async () => {
    const { data, error } = await listIncomingFriendRequests();
    if (error) return;
    setIncomingRequestCount(data.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadIncomingRequestCount();
    }, [loadIncomingRequestCount]),
  );

  async function handleSignOut() {
    await signOutAccount();
  }

  const friendRequestsLabel =
    incomingRequestCount > 0
      ? t('profile.friendRequestsWithCount', { count: String(incomingRequestCount) })
      : t('profile.friendRequests');

  return (
    <Screen centered edges={['top', 'left', 'right']}>
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
      <Button
        label={t('profile.editProfile')}
        onPress={() => router.push('/(app)/(profile)/edit-profile')}
        style={styles.socialButton}
      />
      <Button
        label={t('profile.friends')}
        variant="secondary"
        onPress={() => router.push('/(app)/(profile)/friends')}
        style={styles.socialButton}
      />
      <Button
        label={friendRequestsLabel}
        variant="secondary"
        onPress={() => router.push('/(app)/(profile)/friend-requests')}
        style={styles.socialButton}
      />
      <Button
        label={t('profile.switchAccount')}
        variant="secondary"
        onPress={() => router.push('/(app)/(profile)/switch-account')}
        style={styles.socialButton}
      />
      <Button
        label={t('profile.signOut')}
        variant="secondary"
        onPress={handleSignOut}
        style={styles.socialButton}
      />
      <Button
        label={t('profile.deleteAccount')}
        variant="destructive"
        onPress={() => router.push('/(app)/(profile)/delete-account')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  name: {
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  username: {
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  socialButton: {
    marginBottom: Spacing.sm,
  },
});
