import { DarkColors, LightColors, ThemeColors } from '@/constants/theme';
import { useThemePreference } from '@/context/theme-preference-context';

export function useTheme(): ThemeColors {
  const { colorScheme } = useThemePreference();
  return colorScheme === 'dark' ? DarkColors : LightColors;
}
