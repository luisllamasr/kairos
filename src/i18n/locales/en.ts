export const en = {
  'auth.signIn.title': 'Sign in to Kairos',
  'auth.signIn.subtitle': 'We will send a code to your email.',
  'auth.signIn.emailPlaceholder': 'your@email.com',
  'auth.signIn.submit': 'Send code',
  'auth.signIn.rateLimited': 'For security, wait {{seconds}}s before requesting another code.',
  'auth.signIn.error.invalidEmail': 'Please enter a valid email address.',
  'auth.signIn.error.alreadyActive': 'This account is already active on this device.',
  'auth.signIn.error.alreadyStored': 'This account is already on this device.',
  'auth.signIn.addAccount.subtitle': 'Sign in with another email to add it to this device.',
  'auth.signIn.addAccount.cancel': 'Cancel',
  'auth.signIn.addAccount.cancelFailed':
    'Could not restore your previous account. Please try again.',
  'auth.signIn.error.sendFailed': "We couldn't send the code. Check the email address or try again later.",
  'auth.signIn.error.generic': 'Something went wrong. Please try again.',

  'auth.verify.title': 'Check your email',
  'auth.verify.subtitle': 'Enter the 6-digit code sent to {{email}}.',
  'auth.verify.codePlaceholder': '000000',
  'auth.verify.submit': 'Verify code',
  'auth.verify.changeEmail': 'Use a different email',

  'tab.home': 'Home',
  'tab.profile': 'Profile',

  'home.comingSoon': 'Experiences are coming soon.',

  // Rules describe the field constraints — shared between onboarding and edit profile.
  'profile.username.rules.length': '· 3–30 characters',
  'profile.username.rules.chars': '· Lowercase letters, numbers, . _ and -',
  'profile.username.rules.alphanum': '· At least one letter or number',
  'profile.displayName.rules.length': '· 1–50 characters',
  'profile.editProfile': 'Edit profile',
  'profile.switchAccount': 'Switch account',
  'profile.deleteAccount': 'Delete account',
  'profile.signOut': 'Sign out',

  'onboarding.title': 'Welcome to Kairos',
  'onboarding.subtitle': 'Create your identity to get started.',
  'onboarding.avatar.label': 'Profile photo (optional)',
  'onboarding.username.placeholder': 'your.name',
  'onboarding.displayName.placeholder': 'Your Name',
  'onboarding.submit': 'Continue',
  'onboarding.error.usernameTaken': 'This username is already taken',
  'onboarding.error.usernameInvalid': 'Please follow the username rules.',
  'onboarding.error.displayNameInvalid': 'Please follow the display name rules.',
  'onboarding.error.save': 'Could not save your profile. Please try again.',
  'onboarding.error.avatarUpload': 'Could not upload photo. Please try again.',
  'onboarding.error.avatarPermission': 'Photo library access is required to add a photo.',

  'editProfile.title': 'Edit Profile',
  'editProfile.avatar.label': 'Tap to change photo',
  'editProfile.submit': 'Save changes',
  'editProfile.cancel': 'Cancel',
  'editProfile.error.usernameInvalid': 'Please follow the username rules.',
  'editProfile.error.usernameTaken': 'This username is already taken',
  'editProfile.error.displayNameInvalid': 'Please follow the display name rules.',
  'editProfile.error.avatarUpload': 'Could not upload photo. Please try again.',
  'editProfile.error.avatarPermission': 'Photo library access is required to add a photo.',
  'editProfile.error.save': 'Could not save your profile. Please try again.',

  'deleteAccount.title': 'Delete Account',
  'deleteAccount.warning':
    'This permanently deletes your account, profile, and avatar. This cannot be undone.',
  'deleteAccount.confirmPrompt': 'Type your username (@{{username}}) to confirm:',
  'deleteAccount.submit': 'Delete my account',
  'deleteAccount.cancel': 'Cancel',
  'deleteAccount.error.unauthorized': 'Your session expired. Please sign in again.',
  'deleteAccount.error.failed': 'Could not delete your account. Please try again.',

  'switchAccount.title': 'Switch Account',
  'switchAccount.active': 'Active',
  'switchAccount.switching': 'Switching…',
  'switchAccount.addAccount': 'Add account',
  'switchAccount.cancel': 'Cancel',
  'switchAccount.error.failed': 'Could not switch to that account. It may have expired — sign in again.',

  'error.profileLoad': 'Could not load your profile',
  'error.retry': 'Try again',
} as const;

export type TranslationKey = keyof typeof en;
