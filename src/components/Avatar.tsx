import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface Props {
  // Full URL (remote) or local file URI from the image picker.
  // null shows an initials/placeholder circle.
  uri: string | null;
  // Used to derive the placeholder initial when uri is null.
  displayName?: string | null;
  size?: number;
  onPress?: () => void;
  // Shows a small branded '+' badge at the bottom-right corner.
  // Use when the avatar is tappable to select/change a photo.
  showEditBadge?: boolean;
  style?: ViewStyle;
}

export function Avatar({
  uri,
  displayName,
  size = 64,
  onPress,
  showEditBadge = false,
  style,
}: Props) {
  const colors = useTheme();
  const initial = displayName?.trim()[0]?.toUpperCase() ?? '?';
  const badgeSize = Math.round(size * 0.3);
  const radius = size / 2;

  return (
    <TouchableOpacity
      style={[{ width: size, height: size }, style]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: radius, backgroundColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.textSecondary, fontSize: size * 0.38, fontWeight: '600' }}>
            {initial}
          </Text>
        </View>
      )}

      {showEditBadge && (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: colors.brand,
              borderColor: colors.background,
            },
          ]}
        >
          <Text style={{ color: colors.textInverse, fontSize: badgeSize * 0.6, fontWeight: '700' }}>
            +
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});
