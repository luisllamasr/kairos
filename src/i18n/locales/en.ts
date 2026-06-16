export const en = {
  'auth.signIn.title': 'Sign in to Kairos',
  'auth.signIn.subtitle': 'We will send a code to your email.',
  'auth.signIn.emailPlaceholder': 'your@email.com',
  'auth.signIn.submit': 'Send code',

  'auth.verify.title': 'Check your email',
  'auth.verify.subtitle': 'Enter the 6-digit code sent to {{email}}.',
  'auth.verify.codePlaceholder': '000000',
  'auth.verify.submit': 'Verify code',

  'home.title': 'Kairos',
  'home.subtitle': 'Experiences worth remembering.',
  'home.signOut': 'Sign out',
  'home.switchLanguage': 'Español',
} as const;

export type TranslationKey = keyof typeof en;
