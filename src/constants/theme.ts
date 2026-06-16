export type ThemeColors = {
  background: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  textInverse: string;
  // Brand and textPrimary share the same black today.
  // They are separate so switching to a distinct brand color later touches one token.
  brand: string;
  error: string;
  border: string;
};

export const LightColors: ThemeColors = {
  background: '#FFFFFF',
  textPrimary: '#111111',
  textSecondary: '#555555',
  textDisabled: '#AAAAAA',
  textInverse: '#FFFFFF',
  brand: '#111111',
  error: '#CC0000',
  border: '#DDDDDD',
};

export const DarkColors: ThemeColors = {
  background: '#111111',
  textPrimary: '#F0F0F0',
  textSecondary: '#888888',
  textDisabled: '#555555',
  textInverse: '#111111',
  brand: '#F0F0F0',
  error: '#FF6B6B',
  border: '#333333',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 32,
} as const;

export const FontWeight = {
  regular: '400' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const Radius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
} as const;
