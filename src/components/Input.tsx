import { StyleSheet, TextInput, TextInputProps } from 'react-native';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Input({ style, ...props }: TextInputProps) {
  const colors = useTheme();
  return (
    <TextInput
      style={[
        styles.base,
        {
          borderColor: colors.border,
          color: colors.textPrimary,
          backgroundColor: colors.background,
        },
        style,
      ]}
      placeholderTextColor={colors.textDisabled}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
  },
});
