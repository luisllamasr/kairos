import { StyleSheet, Text as RNText, TextProps } from 'react-native';

import { Colors, FontSize, FontWeight } from '@/constants/theme';

type Variant = 'hero' | 'title' | 'subtitle' | 'body' | 'caption' | 'error';

interface Props extends TextProps {
  variant?: Variant;
}

export function Text({ variant = 'body', style, ...props }: Props) {
  return <RNText style={[styles[variant], style]} {...props} />;
}

const styles = StyleSheet.create({
  hero: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  body: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  caption: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  error: {
    fontSize: FontSize.sm,
    color: Colors.error,
  },
});
