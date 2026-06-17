import { TranslationKey } from './en';

export const es: Record<TranslationKey, string> = {
  'auth.signIn.title': 'Inicia sesión en Kairos',
  'auth.signIn.subtitle': 'Te enviaremos un código a tu correo.',
  'auth.signIn.emailPlaceholder': 'tu@correo.com',
  'auth.signIn.submit': 'Enviar código',

  'auth.verify.title': 'Revisa tu correo',
  'auth.verify.subtitle': 'Introduce el código de 6 dígitos enviado a {{email}}.',
  'auth.verify.codePlaceholder': '000000',
  'auth.verify.submit': 'Verificar código',

  'home.title': 'Kairos',
  'home.subtitle': 'Experiencias que vale la pena recordar.',
  'home.signOut': 'Cerrar sesión',
  'home.switchLanguage': 'English',

  'onboarding.title': 'Bienvenido a Kairos',
  'onboarding.subtitle': 'Crea tu identidad para empezar.',
  'onboarding.username.placeholder': 'angel.luna',
  'onboarding.username.hint': 'Letras, números, . _ - · 3–30 caracteres',
  'onboarding.displayName.placeholder': 'Ángel Luna',
  'onboarding.submit': 'Continuar',
  'onboarding.error.usernameTaken': 'Este nombre de usuario ya está en uso',
  'onboarding.error.usernameInvalid': 'Solo se permiten letras minúsculas, números, . _ y -',
  'onboarding.error.usernameTooShort': 'El nombre de usuario debe tener al menos 3 caracteres',
  'onboarding.error.usernameRequired': 'El nombre de usuario es obligatorio',
  'onboarding.error.displayNameRequired': 'El nombre visible es obligatorio',
  'onboarding.error.save': 'No se pudo guardar tu perfil. Por favor, inténtalo de nuevo.',

  'error.profileLoad': 'No se pudo cargar tu perfil',
  'error.retry': 'Reintentar',
};
