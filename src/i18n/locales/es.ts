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
};
