export const en = {
  'auth.signIn.title': 'Sign in to Kairos',
  'auth.signIn.subtitle': 'We will send a code to your email.',
  'auth.signIn.emailPlaceholder': 'your@email.com',
  'auth.signIn.submit': 'Send code',
  'auth.signIn.rateLimited': 'For security, wait {{seconds}}s before requesting another code.',
  'auth.signIn.error.invalidEmail': 'Please enter a valid email address.',
  'auth.signIn.error.sendFailed': "We couldn't send the code. Check the email address or try again later.",
  'auth.signIn.error.generic': 'Something went wrong. Please try again.',

  'auth.verify.title': 'Check your email',
  'auth.verify.subtitle': 'Enter the 6-digit code sent to {{email}}.',
  'auth.verify.codePlaceholder': '000000',
  'auth.verify.submit': 'Verify code',
  'auth.verify.changeEmail': 'Use a different email',

  'home.signOut': 'Sign out',

  'onboarding.title': 'Welcome to Kairos',
  'onboarding.subtitle': 'Create your identity to get started.',
  'onboarding.avatar.label': 'Profile photo (optional)',
  'onboarding.username.placeholder': 'your.name',
  'onboarding.username.rules.length': '· 3–30 characters',
  'onboarding.username.rules.chars': '· Lowercase letters, numbers, . _ and -',
  'onboarding.username.rules.alphanum': '· At least one letter or number',
  'onboarding.displayName.placeholder': 'Your Name',
  'onboarding.displayName.rules.length': '· 1–50 characters',
  'onboarding.submit': 'Continue',
  'onboarding.error.usernameTaken': 'This username is already taken',
  'onboarding.error.usernameInvalid': 'Please follow the username rules.',
  'onboarding.error.displayNameInvalid': 'Please follow the display name rules.',
  'onboarding.error.save': 'Could not save your profile. Please try again.',
  'onboarding.error.avatarUpload': 'Could not upload photo. Please try again.',
  'onboarding.error.avatarPermission': 'Photo library access is required to add a photo.',

  'error.profileLoad': 'Could not load your profile',
  'error.retry': 'Try again',
} as const;

export type TranslationKey = keyof typeof en;
