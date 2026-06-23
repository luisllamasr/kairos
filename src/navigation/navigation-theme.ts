import { DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';

import { DarkColors, LightColors } from '@/constants/theme';

/** React Navigation theme aligned with Kairos design tokens. */
export function getNavigationTheme(scheme: 'light' | 'dark' | null | undefined): Theme {
  const dark = scheme === 'dark';
  const base = dark ? DarkTheme : DefaultTheme;
  const colors = dark ? DarkColors : LightColors;

  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: colors.brand,
      background: colors.background,
      card: colors.background,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.error,
    },
  };
}

/** Shared Stack options — keeps navigator surfaces on the themed background. */
export function getStackScreenOptions(backgroundColor: string) {
  return {
    headerShown: false,
    contentStyle: { backgroundColor },
  } as const;
}
