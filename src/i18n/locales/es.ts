import { TranslationKey } from './en';

export const es: Record<TranslationKey, string> = {
  'auth.signIn.title': 'Inicia sesión en Kairos',
  'auth.signIn.subtitle': 'Te enviaremos un código a tu correo.',
  'auth.signIn.emailPlaceholder': 'tu@correo.com',
  'auth.signIn.submit': 'Enviar código',
  'auth.signIn.rateLimited': 'Por seguridad, espera {{seconds}}s antes de pedir otro código.',
  'auth.signIn.error.invalidEmail': 'Introduce una dirección de correo válida.',
  'auth.signIn.error.alreadyActive': 'Esta cuenta ya está activa en este dispositivo.',
  'auth.signIn.error.alreadyStored': 'Esta cuenta ya está en este dispositivo.',
  'auth.signIn.addAccount.subtitle': 'Inicia sesión con otro correo para agregarlo a este dispositivo.',
  'auth.signIn.addAccount.cancel': 'Cancelar',
  'auth.signIn.addAccount.cancelFailed':
    'No pudimos restaurar tu cuenta anterior. Inténtalo de nuevo.',
  'auth.signIn.error.sendFailed': 'No pudimos enviar el código. Revisa la dirección de correo o inténtalo más tarde.',
  'auth.signIn.error.generic': 'Algo salió mal. Por favor, inténtalo de nuevo.',

  'auth.verify.title': 'Revisa tu correo',
  'auth.verify.subtitle': 'Introduce el código de 6 dígitos enviado a {{email}}.',
  'auth.verify.codePlaceholder': '000000',
  'auth.verify.submit': 'Verificar código',
  'auth.verify.changeEmail': 'Usar un correo diferente',

  'tab.home': 'Inicio',
  'tab.profile': 'Perfil',

  'home.comingSoon': 'Las experiencias llegan pronto.',

  'profile.username.rules.length': '· 3–30 caracteres',
  'profile.username.rules.chars': '· Solo letras minúsculas, números, . _ y -',
  'profile.username.rules.alphanum': '· Al menos una letra o número',
  'profile.displayName.rules.length': '· 1–50 caracteres',
  'profile.editProfile': 'Editar perfil',
  'profile.switchAccount': 'Cambiar cuenta',
  'profile.deleteAccount': 'Eliminar cuenta',
  'profile.signOut': 'Cerrar sesión',

  'onboarding.title': 'Bienvenido a Kairos',
  'onboarding.subtitle': 'Crea tu identidad para empezar.',
  'onboarding.avatar.label': 'Foto de perfil (opcional)',
  'onboarding.username.placeholder': 'tu.nombre',
  'onboarding.displayName.placeholder': 'Tu Nombre',
  'onboarding.submit': 'Continuar',
  'onboarding.error.usernameTaken': 'Este nombre de usuario ya está en uso',
  'onboarding.error.usernameInvalid': 'Por favor, sigue las reglas del nombre de usuario.',
  'onboarding.error.displayNameInvalid': 'Por favor, sigue las reglas del nombre visible.',
  'onboarding.error.save': 'No se pudo guardar tu perfil. Por favor, inténtalo de nuevo.',
  'onboarding.error.avatarUpload': 'No se pudo subir la foto. Por favor, inténtalo de nuevo.',
  'onboarding.error.avatarPermission': 'Se necesita acceso a la galería para agregar una foto.',

  'editProfile.title': 'Editar Perfil',
  'editProfile.avatar.label': 'Toca para cambiar la foto',
  'editProfile.submit': 'Guardar cambios',
  'editProfile.cancel': 'Cancelar',
  'editProfile.error.usernameInvalid': 'Por favor, sigue las reglas del nombre de usuario.',
  'editProfile.error.usernameTaken': 'Este nombre de usuario ya está en uso',
  'editProfile.error.displayNameInvalid': 'Por favor, sigue las reglas del nombre visible.',
  'editProfile.error.avatarUpload': 'No se pudo subir la foto. Por favor, inténtalo de nuevo.',
  'editProfile.error.avatarPermission': 'Se necesita acceso a la galería para agregar una foto.',
  'editProfile.error.save': 'No se pudo guardar tu perfil. Por favor, inténtalo de nuevo.',

  'deleteAccount.title': 'Eliminar Cuenta',
  'deleteAccount.warning':
    'Esto elimina permanentemente tu cuenta, perfil y avatar. No se puede deshacer.',
  'deleteAccount.confirmPrompt': 'Escribe tu nombre de usuario (@{{username}}) para confirmar:',
  'deleteAccount.submit': 'Eliminar mi cuenta',
  'deleteAccount.cancel': 'Cancelar',
  'deleteAccount.error.unauthorized': 'Tu sesión expiró. Por favor, inicia sesión de nuevo.',
  'deleteAccount.error.failed': 'No se pudo eliminar tu cuenta. Por favor, inténtalo de nuevo.',

  'switchAccount.title': 'Cambiar Cuenta',
  'switchAccount.active': 'Activa',
  'switchAccount.switching': 'Cambiando…',
  'switchAccount.addAccount': 'Agregar cuenta',
  'switchAccount.cancel': 'Cancelar',
  'switchAccount.error.failed':
    'No se pudo cambiar a esa cuenta. Puede haber expirado — inicia sesión de nuevo.',

  'error.profileLoad': 'No se pudo cargar tu perfil',
  'error.retry': 'Reintentar',
};
