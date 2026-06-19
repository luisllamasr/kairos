import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { getAvatarPublicUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { profile } = useAuth();
  const { t } = useI18n();

  // Each avatar upload writes to a unique timestamped path, so profile.avatar_url
  // changes after every save. The CDN URL naturally points to a new resource —
  // no cache-busting query params needed.
  const avatarUri = getAvatarPublicUrl(profile?.avatar_url ?? null);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

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
        style={styles.editButton}
      />
      <Button
        label={t('profile.signOut')}
        variant="secondary"
        onPress={handleSignOut}
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
  editButton: {
    marginBottom: Spacing.sm,
  },
});
