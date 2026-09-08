import AsyncStorage from '@react-native-async-storage/async-storage';

// Device-level app preferences (theme, language). Deliberately separate from
// auth-storage's encrypted per-account vault: these aren't sensitive and
// aren't tied to a specific signed-in account — switching accounts on the
// same device should not change the theme or language.

export type ThemePreference = 'light' | 'dark' | 'system';
export type LanguagePreference = 'en' | 'es' | 'system';

const THEME_KEY = 'kairos.preferences.theme.v1';
const LANGUAGE_KEY = 'kairos.preferences.language.v1';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isLanguagePreference(value: string | null): value is LanguagePreference {
  return value === 'en' || value === 'es' || value === 'system';
}

export async function getStoredThemePreference(): Promise<ThemePreference> {
  const raw = await AsyncStorage.getItem(THEME_KEY);
  return isThemePreference(raw) ? raw : 'system';
}

export async function setStoredThemePreference(value: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, value);
}

export async function getStoredLanguagePreference(): Promise<LanguagePreference> {
  const raw = await AsyncStorage.getItem(LANGUAGE_KEY);
  return isLanguagePreference(raw) ? raw : 'system';
}

export async function setStoredLanguagePreference(value: LanguagePreference): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, value);
}
