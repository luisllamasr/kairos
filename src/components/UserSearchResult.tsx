import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { getAvatarPublicUrl } from '@/lib/profile';
import { PublicProfile } from '@/types/public-profile';

interface Props {
  profile: PublicProfile;
  onPress: () => void;
}

export function UserSearchResult({ profile, onPress }: Props) {
  const avatarUri = getAvatarPublicUrl(profile.avatar_url);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Avatar uri={avatarUri} displayName={profile.display_name} size={48} />
      <View style={styles.textBlock}>
        <Text variant="body" numberOfLines={1}>
          {profile.display_name ?? profile.username}
        </Text>
        <Text variant="caption">@{profile.username}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  textBlock: {
    flex: 1,
    gap: Spacing.xs,
  },
});
