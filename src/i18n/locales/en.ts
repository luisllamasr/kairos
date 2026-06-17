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

  'onboarding.title': 'Welcome to Kairos',
  'onboarding.subtitle': 'Create your identity to get started.',
  'onboarding.username.placeholder': 'angel.luna',
  'onboarding.username.hint': 'Letters, numbers, . _ - · 3–30 characters',
  'onboarding.displayName.placeholder': 'Angel Luna',
  'onboarding.submit': 'Continue',
  'onboarding.error.usernameTaken': 'This username is already taken',
  'onboarding.error.usernameInvalid': 'Only lowercase letters, numbers, . _ and - allowed',
  'onboarding.error.usernameTooShort': 'Username must be at least 3 characters',
  'onboarding.error.usernameRequired': 'Username is required',
  'onboarding.error.displayNameRequired': 'Display name is required',
  'onboarding.error.save': 'Could not save your profile. Please try again.',

  'error.profileLoad': 'Could not load your profile',
  'error.retry': 'Try again',
} as const;

export type TranslationKey = keyof typeof en;
