import { TranslationKey } from './en';

export const es: Record<TranslationKey, string> = {
  'auth.signIn.title': 'Inicia sesión en Kairos',
  'auth.signIn.subtitle': 'Te enviaremos un código a tu correo.',
  'auth.signIn.emailPlaceholder': 'tu@correo.com',
  'auth.signIn.submit': 'Enviar código',
  'auth.signIn.rateLimited': 'Por seguridad, espera {{seconds}}s antes de pedir otro código.',
  'auth.signIn.error.invalidEmail': 'Introduce una dirección de correo válida.',
  'auth.signIn.error.sendFailed': 'No pudimos enviar el código. Revisa la dirección de correo o inténtalo más tarde.',
  'auth.signIn.error.generic': 'Algo salió mal. Por favor, inténtalo de nuevo.',

  'auth.verify.title': 'Revisa tu correo',
  'auth.verify.subtitle': 'Introduce el código de 6 dígitos enviado a {{email}}.',
  'auth.verify.codePlaceholder': '000000',
  'auth.verify.submit': 'Verificar código',
  'auth.verify.changeEmail': 'Usar un correo diferente',

  'home.signOut': 'Cerrar sesión',

  'onboarding.title': 'Bienvenido a Kairos',
  'onboarding.subtitle': 'Crea tu identidad para empezar.',
  'onboarding.avatar.label': 'Foto de perfil (opcional)',
  'onboarding.username.placeholder': 'tu.nombre',
  'onboarding.username.rules.length': '· 3–30 caracteres',
  'onboarding.username.rules.chars': '· Solo letras minúsculas, números, . _ y -',
  'onboarding.username.rules.alphanum': '· Al menos una letra o número',
  'onboarding.displayName.placeholder': 'Tu Nombre',
  'onboarding.displayName.rules.length': '· 1–50 caracteres',
  'onboarding.submit': 'Continuar',
  'onboarding.error.usernameTaken': 'Este nombre de usuario ya está en uso',
  'onboarding.error.usernameInvalid': 'Por favor, sigue las reglas del nombre de usuario.',
  'onboarding.error.displayNameInvalid': 'Por favor, sigue las reglas del nombre visible.',
  'onboarding.error.save': 'No se pudo guardar tu perfil. Por favor, inténtalo de nuevo.',
  'onboarding.error.avatarUpload': 'No se pudo subir la foto. Por favor, inténtalo de nuevo.',
  'onboarding.error.avatarPermission': 'Se necesita acceso a la galería para agregar una foto.',

  'error.profileLoad': 'No se pudo cargar tu perfil',
  'error.retry': 'Reintentar',
};
