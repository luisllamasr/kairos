import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { getAvatarPublicUrl } from '@/lib/profile';
import { getPublicProfile } from '@/lib/users';
import { PublicProfile } from '@/types/public-profile';

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { profile: ownProfile } = useAuth();
  const { t } = useI18n();
  const colors = useTheme();

  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!username || typeof username !== 'string') {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    setNotFound(false);

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

    setLoading(false);
  }, [username]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const isSelf = Boolean(
    publicProfile && ownProfile?.username && publicProfile.username === ownProfile.username,
  );

  const avatarUri = getAvatarPublicUrl(publicProfile?.avatar_url ?? null);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Button
        label={t('publicProfile.back')}
        variant="secondary"
        onPress={() => router.back()}
        style={styles.backButton}
      />

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}

      {!loading && error && (
        <View style={styles.stateBlock}>
          <Text variant="error" style={styles.centeredText}>
            {t('publicProfile.loadError')}
          </Text>
          <Button label={t('error.retry')} onPress={loadProfile} style={styles.retryButton} />
        </View>
      )}

      {!loading && notFound && (
        <View style={styles.stateBlock}>
          <Text variant="title" style={styles.centeredText}>
            {t('publicProfile.notFound')}
          </Text>
          <Text variant="subtitle" style={styles.centeredText}>
            {t('publicProfile.notFoundHint')}
          </Text>
        </View>
      )}

      {!loading && publicProfile && (
        <View style={styles.profileBlock}>
          <Avatar
            uri={avatarUri}
            displayName={publicProfile.display_name}
            size={88}
            style={styles.avatar}
          />
          <Text variant="hero" style={styles.centeredText}>
            {publicProfile.display_name ?? publicProfile.username}
          </Text>
          <Text variant="subtitle" style={styles.username}>
            @{publicProfile.username}
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

          {/* Milestone 11: Follow / unfollow action */}
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
    marginBottom: Spacing.xxl,
  },
  selfBlock: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  goProfileButton: {
    marginTop: Spacing.sm,
  },
});
