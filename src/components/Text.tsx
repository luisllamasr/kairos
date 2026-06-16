import { StyleSheet, Text as RNText, TextProps } from 'react-native';

import { FontSize, FontWeight, ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'hero' | 'title' | 'subtitle' | 'body' | 'caption' | 'error';

interface Props extends TextProps {
  variant?: Variant;
}

function colorFor(variant: Variant, colors: ThemeColors): string {
  switch (variant) {
    case 'hero':
    case 'title':
    case 'body':
      return colors.textPrimary;
    case 'subtitle':
    case 'caption':
      return colors.textSecondary;
    case 'error':
      return colors.error;
  }
}

export function Text({ variant = 'body', style, ...props }: Props) {
  const colors = useTheme();
  return (
    <RNText
      style={[staticStyles[variant], { color: colorFor(variant, colors) }, style]}
      {...props}
    />
  );
}

const staticStyles = StyleSheet.create({
  hero: { fontSize: FontSize.xxxl, fontWeight: FontWeight.semibold },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.semibold },
  subtitle: { fontSize: FontSize.md },
  body: { fontSize: FontSize.md },
  caption: { fontSize: FontSize.sm },
  error: { fontSize: FontSize.sm },
});
