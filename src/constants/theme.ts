export const Colors = {
  // Backgrounds
  background: '#FFFFFF',

  // Text
  textPrimary: '#111111',
  textSecondary: '#555555',
  textDisabled: '#AAAAAA',
  textInverse: '#FFFFFF',

  // Brand / primary actions
  // Same black as textPrimary today; easy to update to a brand color later.
  brand: '#111111',

  // Semantic
  error: '#CC0000',

  // Borders / surfaces
  border: '#DDDDDD',
} as const;

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
