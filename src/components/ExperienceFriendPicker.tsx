import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { DISABLE_SCROLL_INSET_ADJUSTMENT } from '@/constants/layout';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { listFriends } from '@/lib/friendships';
import { getAvatarPublicUrl } from '@/lib/profile';
import { PublicProfile } from '@/types/public-profile';

const EMPTY_EXCLUDE_IDS: string[] = [];

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  excludeUserIds?: string[];
}

export function ExperienceFriendPicker({
  selectedIds,
  onChange,
  multiple = true,
  excludeUserIds = EMPTY_EXCLUDE_IDS,
}: Props) {
  const { t } = useI18n();
  const colors = useTheme();

  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const excludeKey = excludeUserIds.join('\0');

  useEffect(() => {
    let cancelled = false;

    async function loadFriends() {
      setLoading(true);
      setError(false);

      const { data, error: loadError } = await listFriends();
      if (cancelled) return;

      setFriends(data.filter((friend) => friend.user_id));
      setError(loadError);
      setLoading(false);
    }

    void loadFriends();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleFriends = useMemo(
    () =>
      friends.filter(
        (friend) => friend.user_id && !excludeUserIds.includes(friend.user_id),
      ),
    // excludeKey tracks excludeUserIds content without refetching on new array identity.
    [friends, excludeKey],
  );

  function toggleFriend(userId: string) {
    if (multiple) {
      if (selectedIds.includes(userId)) {
        onChange(selectedIds.filter((id) => id !== userId));
        return;
      }
      onChange([...selectedIds, userId]);
      return;
    }

    onChange(selectedIds.includes(userId) ? [] : [userId]);
  }

  if (loading) {
    return (
      <View style={styles.loadingSlot}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <Text variant="error" style={styles.message}>
        {t('experiences.invites.friendsLoadError')}
      </Text>
    );
  }

  if (friends.length === 0) {
    return (
      <Text variant="caption" style={styles.message}>
        {t('experiences.invites.noFriends')}
      </Text>
    );
  }

  if (visibleFriends.length === 0) {
    return (
      <Text variant="caption" style={styles.message}>
        {t('experiences.invites.noFriendsAvailable')}
      </Text>
    );
  }

  return (
    <ScrollView
      style={styles.list}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      {...DISABLE_SCROLL_INSET_ADJUSTMENT}
    >
      {visibleFriends.map((friend) => {
        const userId = friend.user_id;
        if (!userId) return null;

        const selected = selectedIds.includes(userId);
        const label = friend.display_name ?? friend.username;

        return (
          <Pressable
            key={userId}
            onPress={() => toggleFriend(userId)}
            style={({ pressed }) => [
              styles.row,
              selected && { borderColor: colors.brand, borderWidth: 1 },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Avatar uri={getAvatarPublicUrl(friend.avatar_url)} displayName={label} size={40} />
            <View style={styles.textBlock}>
              <Text variant="body" numberOfLines={1}>
                {label}
              </Text>
              <Text variant="caption">@{friend.username}</Text>
            </View>
            {selected ? (
              <Text variant="caption" style={{ color: colors.brand }}>
                {t('experiences.invites.selected')}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingSlot: {
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    marginVertical: Spacing.sm,
  },
  list: {
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  textBlock: {
    flex: 1,
    gap: Spacing.xs,
  },
});
