import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { getAvatarPublicUrl } from '@/lib/profile';
import { RememberedAccount } from '@/lib/auth-storage';

interface Props {
  account: RememberedAccount;
  isActive?: boolean;
  isLoading?: boolean;
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
  onPress,
  onLogIn,
  onRemove,
  showRemove = false,
  disabled = false,
}: Props) {
  const { t } = useI18n();
  const label =
    account.display_name ||
    (account.username ? `@${account.username}` : account.email);
  const signedOut = !account.hasSession;

  return (
    <View style={styles.rowWrap}>
      <Pressable
        style={[styles.row, isActive && styles.rowActive, disabled && styles.rowDisabled]}
        onPress={onPress}
        disabled={disabled || isActive || isLoading || (!onPress && !signedOut)}
      >
        <Avatar
          uri={getAvatarPublicUrl(account.avatar_url)}
          displayName={account.display_name ?? account.username ?? account.email}
          size={48}
        />
        <View style={styles.rowText}>
          <Text variant="body">{label}</Text>
          {account.username ? (
            <Text variant="caption">@{account.username}</Text>
          ) : (
            <Text variant="caption">{account.email}</Text>
          )}
        </View>
        {isActive ? (
          <Text variant="caption">{t('switchAccount.active')}</Text>
        ) : isLoading ? (
          <Text variant="caption">{t('switchAccount.switching')}</Text>
        ) : signedOut ? (
          <Text variant="caption">{t('switchAccount.signedOut')}</Text>
        ) : null}
      </Pressable>

      {signedOut && !isActive ? (
        <View style={styles.actions}>
          {onLogIn ? (
            <Button
              label={t('switchAccount.logIn')}
              variant="secondary"
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
});
