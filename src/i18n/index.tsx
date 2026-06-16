import { getLocales } from 'expo-localization';
import { createContext, ReactNode, useContext, useState } from 'react';

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

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectLocale);

  function t(key: TranslationKey, params?: Record<string, string>): string {
    let str: string = translations[locale][key] ?? translations.en[key] ?? (key as string);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{{${k}}}`, v);
      });
    }
    return str;
  }

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
