import { getLocales } from 'expo-localization';
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { en, TranslationKey } from './locales/en';
import { es } from './locales/es';

type Locale = 'en' | 'es';

const translations: Record<Locale, Record<TranslationKey, string>> = { en, es };

function detectLocale(): Locale {
  try {
    const tag = getLocales()[0]?.languageCode ?? 'en';
    return tag === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Keys with a `.other` variant are assumed to also have a matching `.one`
 * variant (e.g. `foo.bar.one` / `foo.bar.other`) — enforced by convention,
 * not the type system, since TranslationKey has no way to require a pair.
 */
type PluralKey = Extract<TranslationKey, `${string}.other`>;

function oneVariant(key: PluralKey): TranslationKey {
  return key.replace(/\.other$/, '.one') as TranslationKey;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
  /**
   * Pluralized variant of `t`. English and Spanish both only distinguish
   * "one" (count === 1) from "other" (everything else, including 0) per
   * CLDR — that's the only split this needs to support today. Pass the
   * `.other` key; the `.one` key is derived from it by convention.
   *
   * Deliberately does its own `count === 1` check instead of
   * `Intl.PluralRules` — Hermes (React Native's default JS engine) doesn't
   * implement `Intl.PluralRules` at all, so calling it crashes at runtime
   * rather than falling back gracefully. A polyfill would fix that, but
   * would be pure overhead for two locales whose cardinal rule is this
   * one-liner; revisit only if a future locale needs a real ICU plural rule.
   */
  tn: (key: PluralKey, count: number, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectLocale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>): string => {
      let str: string = translations[locale][key] ?? translations.en[key] ?? (key as string);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          str = str.replace(`{{${k}}}`, v);
        });
      }
      return str;
    },
    [locale],
  );

  const tn = useCallback(
    (key: PluralKey, count: number, params?: Record<string, string>): string => {
      const resolvedKey = count === 1 ? oneVariant(key) : key;
      return t(resolvedKey, { count: String(count), ...params });
    },
    [t],
  );

  const value = useMemo(() => ({ locale, setLocale, t, tn }), [locale, t, tn]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
