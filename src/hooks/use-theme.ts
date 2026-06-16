import { useColorScheme } from 'react-native';

import { DarkColors, LightColors, ThemeColors } from '@/constants/theme';

export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DarkColors : LightColors;
}
