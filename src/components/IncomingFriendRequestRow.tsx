import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getAvatarPublicUrl } from '@/lib/profile';
import { IncomingFriendRequest } from '@/types/public-profile';

interface Props {
  request: IncomingFriendRequest;
  loading?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onPressProfile: () => void;
}

export function IncomingFriendRequestRow({
  request,
  loading = false,
  onAccept,
  onDecline,
  onPressProfile,
}: Props) {
  const { t } = useI18n();
  const avatarUri = getAvatarPublicUrl(request.avatar_url);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPressProfile}
        style={({ pressed }) => [styles.profilePress, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Avatar uri={avatarUri} displayName={request.display_name} size={48} />
        <View style={styles.textBlock}>
          <Text variant="body" numberOfLines={1}>
            {request.display_name ?? request.username}
          </Text>
          <Text variant="caption">@{request.username}</Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Button
          label={t('friendRequests.accept')}
          onPress={onAccept}
          loading={loading}
          style={styles.actionButton}
        />
        <Button
          label={t('friendRequests.decline')}
          variant="secondary"
          onPress={onDecline}
          disabled={loading}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.3)',
  },
  profilePress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  textBlock: {
    flex: 1,
    gap: Spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
