import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';

import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary';

interface Props extends Omit<TouchableOpacityProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  ...props
}: Props) {
  const colors = useTheme();
  const isPrimary = variant === 'primary';

  const dynamicContainer = isPrimary
    ? { backgroundColor: colors.brand }
    : { borderColor: colors.border };

  const labelColor = isPrimary ? colors.textInverse : colors.textSecondary;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        isPrimary ? styles.primaryBase : styles.secondaryBase,
        dynamicContainer,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    // Horizontal padding ensures compact buttons (non-full-width containers) look right.
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBase: {},
  secondaryBase: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
});
