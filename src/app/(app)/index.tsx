import { StyleSheet } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/i18n';
import { supabase } from '@/lib/supabase';

// Constructs the public URL for an avatars bucket path.
// Returns null if no path is stored — Avatar handles the placeholder.
function getAvatarUri(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  return supabase.storage.from('avatars').getPublicUrl(storagePath).data.publicUrl;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const { t } = useI18n();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <Screen centered style={styles.screen}>
      <Avatar
        uri={getAvatarUri(profile?.avatar_url)}
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
        label={t('home.signOut')}
        variant="secondary"
        onPress={handleSignOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
  },
  avatar: {
    marginBottom: Spacing.lg,
  },
  name: {
    marginBottom: Spacing.xs,
  },
  username: {
    marginBottom: Spacing.xxl,
  },
});
