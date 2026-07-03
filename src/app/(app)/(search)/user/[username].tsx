import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { DetailLoadingSlot } from '@/components/DetailLoadingSlot';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { useI18n } from '@/i18n';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '@/lib/friendships';
import { getAvatarPublicUrl } from '@/lib/profile';
import { getPublicProfile } from '@/lib/users';
import { PublicProfileWithRelationship } from '@/types/public-profile';
import { RelationshipStatus } from '@/types/relationship';

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { profile: ownProfile } = useAuth();
  const { t } = useI18n();

  const [publicProfile, setPublicProfile] = useState<PublicProfileWithRelationship | null>(null);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!username || typeof username !== 'string') {
      setNotFound(true);
      setError(false);
      setPublicProfile(null);
      return;
    }

    setError(false);
    setNotFound(false);
    setActionError(false);

    const { data, error: loadError } = await getPublicProfile(username);

    if (loadError) {
      setError(true);
      setPublicProfile(null);
    } else if (!data) {
      setNotFound(true);
      setPublicProfile(null);
    } else {
      setPublicProfile(data);
    }
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.sm,
  },
  avatar: {
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  username: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
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
});
