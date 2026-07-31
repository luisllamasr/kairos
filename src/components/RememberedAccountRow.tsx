import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { FontWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { getAvatarPublicUrl } from '@/lib/profile';
import { RememberedAccount } from '@/lib/auth-storage';

interface Props {
  account: RememberedAccount;
  isActive?: boolean;
  isLoading?: boolean;
  /**
   * This account's session tokens are already stored on this device (not
   * merely "remembered" as a signed-out snapshot) — resuming needs no OTP.
   * Opt-in per screen: callers that already convey this via their own
   * interaction pattern (e.g. tap-row-to-switch on an authenticated screen)
   * should leave this false.
   */
  dormant?: boolean;
  /** Tap row — switch (signed-in) or log in (signed-out). */
  onPress?: () => void;
  onLogIn?: () => void;
  onRemove?: () => void;
  showRemove?: boolean;
  disabled?: boolean;
}

export function RememberedAccountRow({
  account,
  isActive = false,
  isLoading = false,
  dormant = false,
  onPress,
  onLogIn,
  onRemove,
  showRemove = false,
  disabled = false,
}: Props) {
  const { t } = useI18n();
  const colors = useTheme();
  // Email is a bearer credential's identifier, not just a label — only the
  // currently-authenticated account's own row may fall back to showing it.
  // Every other row (dormant or signed-out) falls back to a generic label
  // instead, since a device can be shared and these rows render even when
  // the account isn't the one currently in control of the screen.
  const label =
    account.display_name ||
    (account.username
      ? `@${account.username}`
      : isActive
        ? account.email
        : t('switchAccount.unnamedAccount'));
  const caption = account.username ? `@${account.username}` : isActive ? account.email : null;
  const signedOut = !account.hasSession;

  return (
    <View style={styles.rowWrap}>
      <Pressable
        style={[
          styles.row,
          isActive && styles.rowActive,
          dormant && { backgroundColor: colors.border },
          disabled && styles.rowDisabled,
        ]}
        onPress={onPress}
        disabled={disabled || isActive || isLoading || (!onPress && !signedOut && !dormant)}
      >
        <Avatar
          uri={getAvatarPublicUrl(account.avatar_url)}
          displayName={account.display_name ?? account.username ?? (isActive ? account.email : undefined)}
          size={48}
        />
        <View style={styles.rowText}>
          <Text variant="body">{label}</Text>
          {caption ? <Text variant="caption">{caption}</Text> : null}
        </View>
        {isActive ? (
          <Text variant="caption">{t('switchAccount.active')}</Text>
        ) : isLoading ? (
          <Text variant="caption">{t('switchAccount.switching')}</Text>
        ) : dormant ? (
          <Text variant="caption" style={styles.dormantBadge}>
            {t('switchAccount.readyToContinue')}
          </Text>
        ) : signedOut ? (
          <Text variant="caption">{t('switchAccount.signedOut')}</Text>
        ) : null}
      </Pressable>

      {(signedOut || dormant) && !isActive ? (
        <View style={styles.actions}>
          {onLogIn ? (
            <Button
              label={dormant ? t('switchAccount.continue') : t('switchAccount.logIn')}
              variant={dormant ? 'primary' : 'secondary'}
              onPress={onLogIn}
              disabled={disabled || isLoading}
              style={styles.actionButton}
            />
          ) : null}
          {showRemove && onRemove ? (
            <Button
              label={t('switchAccount.removeFromDevice')}
              variant="secondary"
              onPress={onRemove}
              disabled={disabled || isLoading}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: 8,
  },
  rowActive: {
    opacity: 0.85,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    gap: Spacing.xs,
  },
  actions: {
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  actionButton: {
    marginBottom: 0,
  },
  dormantBadge: {
    fontWeight: FontWeight.semibold,
  },
});
