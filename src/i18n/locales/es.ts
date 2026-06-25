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
  'auth.signIn.error.alreadySignedIn':
    'Esta cuenta ya tiene sesión iniciada en este dispositivo. Cambia de cuenta desde Perfil.',
  'auth.signIn.reauth.subtitle': 'Vuelve a iniciar sesión como {{name}}.',
  'auth.signIn.remembered.title': 'Recordadas en este dispositivo',
  'auth.signIn.remembered.orEmail': 'O inicia sesión con correo',
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
  'tab.search': 'Buscar',
  'tab.profile': 'Perfil',

  'home.plansTitle': 'Tus planes',
  'home.plansSubtitle': 'Momentos reales que piensas vivir.',
  'home.newExperience': 'Nueva experiencia',
  'home.empty': 'Aún no tienes planes.',
  'home.emptyHint': 'Planea algo que merezca ser recordado.',
  'home.loadError': 'No se pudieron cargar tus planes. Por favor, inténtalo de nuevo.',

  'experiences.back': 'Atrás',
  'experiences.title.placeholder': '¿Qué estás planeando?',
  'experiences.description.placeholder': 'Descripción (opcional)',
  'experiences.location.placeholder': 'Ubicación (opcional)',
  'experiences.startsAt.label': 'Empieza',
  'experiences.endsAt.label': 'Termina',
  'experiences.endsAt.hint':
    '¿Cuándo termina? Da tu mejor estimación — esto ayuda a Kairos a crear tu recuerdo.',
  'experiences.dateTime.done': 'Listo',
  'experiences.dateTime.cancel': 'Cancelar',
  'experiences.form.cancel': 'Cancelar',
  'experiences.status.cancelled': 'Cancelado',

  'experiences.create.title': 'Nueva experiencia',
  'experiences.create.submit': 'Crear plan',

  'experiences.edit.title': 'Editar plan',
  'experiences.edit.submit': 'Guardar cambios',

  'experiences.detail.transformNotice':
    'Cuando termine tu plan, Kairos creará un recuerdo automáticamente.',
  'experiences.detail.endedNotice':
    'Este plan ha terminado. Abriendo tu recuerdo…',
  'experiences.detail.edit': 'Editar plan',
  'experiences.detail.cancelPlan': 'Cancelar plan',
  'experiences.detail.remove': 'Quitar plan',

  'experiences.cancelConfirm.title': '¿Cancelar este plan?',
  'experiences.cancelConfirm.message':
    'Este plan ya no ocurrirá. Seguirá visible hasta poco después de la hora prevista.',
  'experiences.cancelConfirm.confirm': 'Cancelar plan',
  'experiences.cancelConfirm.keep': 'Conservar plan',

  'experiences.removeConfirm.title': '¿Quitar este plan?',
  'experiences.removeConfirm.message':
    'Esto quita el plan de tu Kairos. Ya no lo verás en tus planes.',
  'experiences.removeConfirm.confirm': 'Quitar plan',
  'experiences.removeConfirm.keep': 'Conservar plan',

  'experiences.error.create': 'No se pudo crear tu plan. Por favor, inténtalo de nuevo.',
  'experiences.error.update': 'No se pudo actualizar tu plan. Por favor, inténtalo de nuevo.',
  'experiences.error.load': 'No se pudo cargar este plan. Por favor, inténtalo de nuevo.',
  'experiences.error.cancel': 'No se pudo cancelar este plan. Por favor, inténtalo de nuevo.',
  'experiences.error.remove': 'No se pudo quitar este plan. Por favor, inténtalo de nuevo.',
  'experiences.error.invalidDates': 'La hora de fin debe ser posterior al inicio.',
  'experiences.error.startsInPast':
    'La hora de inicio debe ser al menos 10 minutos desde ahora. Los momentos pasados son Recuerdos.',
  'experiences.error.titleRequired': 'Por favor, introduce un título.',
  'experiences.error.titleTooLong': 'El título debe tener 120 caracteres o menos.',
  'experiences.error.descriptionTooLong': 'La descripción debe tener 2.000 caracteres o menos.',
  'experiences.error.locationTooLong': 'La ubicación debe tener 200 caracteres o menos.',
  'experiences.error.notUpcoming': 'Este plan ya no se puede editar.',

  'profile.username.rules.length': '· 3–30 caracteres',
  'profile.username.rules.chars': '· Solo letras minúsculas, números, . _ y -',
  'profile.username.rules.alphanum': '· Al menos una letra o número',
  'profile.displayName.rules.length': '· 1–50 caracteres',
  'profile.editProfile': 'Editar perfil',
  'profile.stats.memories': 'Recuerdos',
  'profile.stats.friends': 'Amigos',
  'profile.memoriesSection.title': 'Recuerdos',
  'profile.memoriesSection.search': 'Buscar',
  'profile.memoriesSection.empty':
    'Aún no tienes recuerdos. Tus experiencias aparecerán aquí después de vivirlas.',
  'profile.friends': 'Amigos',
  'profile.friendRequests': 'Solicitudes de amistad',
  'profile.friendRequestsWithCount': 'Solicitudes de amistad ({{count}})',
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
  'deleteAccount.finalConfirm.title': '¿Eliminar tu cuenta?',
  'deleteAccount.finalConfirm.message':
    'Esto elimina permanentemente tu cuenta de Kairos, perfil y avatar. No se puede deshacer.',
  'deleteAccount.finalConfirm.confirm': 'Eliminar mi cuenta',
  'deleteAccount.finalConfirm.cancel': 'Conservar',
  'deleteAccount.error.unauthorized': 'Tu sesión expiró. Por favor, inicia sesión de nuevo.',
  'deleteAccount.error.failed': 'No se pudo eliminar tu cuenta. Por favor, inténtalo de nuevo.',

  'switchAccount.title': 'Cambiar Cuenta',
  'switchAccount.active': 'Activa',
  'switchAccount.signedOut': 'Sesión cerrada',
  'switchAccount.logIn': 'Iniciar sesión',
  'switchAccount.switching': 'Cambiando…',
  'switchAccount.addAccount': 'Agregar cuenta',
  'switchAccount.cancel': 'Cancelar',
  'switchAccount.removeFromDevice': 'Quitar de este dispositivo',
  'switchAccount.removeConfirm.title': '¿Quitar de este dispositivo?',
  'switchAccount.removeConfirm.message':
    'Esto solo quita la cuenta de este dispositivo. Tu cuenta de Kairos no se elimina.',
  'switchAccount.removeConfirm.cancel': 'Conservar',
  'switchAccount.error.failed':
    'No pudimos cambiar a esa cuenta. Intenta iniciar sesión de nuevo.',

  'search.title': 'Encontrar personas',
  'search.subtitle': 'Busca usuarios de Kairos por nombre de usuario.',
  'search.placeholder': 'Buscar @usuario',
  'search.minLength': 'Introduce al menos 3 caracteres.',
  'search.noResults': 'No se encontraron usuarios.',
  'search.error': 'No se pudo buscar. Por favor, inténtalo de nuevo.',

  'publicProfile.notFound': 'Usuario no encontrado',
  'publicProfile.notFoundHint':
    'Este nombre de usuario puede no existir o el registro puede estar incompleto.',
  'publicProfile.isSelf': 'Este es tu perfil.',
  'publicProfile.goToProfile': 'Ir a la pestaña Perfil',
  'publicProfile.loadError': 'No se pudo cargar este perfil. Por favor, inténtalo de nuevo.',
  'publicProfile.back': 'Atrás',
  'publicProfile.addFriend': 'Agregar amigo',
  'publicProfile.requestSent': 'Solicitud de amistad enviada.',
  'publicProfile.cancelRequest': 'Cancelar solicitud',
  'publicProfile.acceptRequest': 'Aceptar',
  'publicProfile.declineRequest': 'Rechazar',
  'publicProfile.friends': 'Son amigos.',
  'publicProfile.removeFriend': 'Eliminar amigo',
  'publicProfile.removeFriend.title': '¿Eliminar amigo?',
  'publicProfile.removeFriend.message':
    'Ya no podrán invitarse mutuamente a experiencias privadas.',
  'publicProfile.removeFriend.confirm': 'Eliminar amigo',
  'publicProfile.removeFriend.cancel': 'Conservar amigo',
  'publicProfile.actionError': 'No se pudo actualizar la amistad. Por favor, inténtalo de nuevo.',

  'friends.title': 'Amigos',
  'friends.subtitle': 'Personas con las que compartes amistad mutua en Kairos.',
  'friends.empty':
    'Aún no tienes amigos. Encuentra personas en Buscar y envía una solicitud de amistad.',
  'friends.error': 'No se pudieron cargar tus amigos. Por favor, inténtalo de nuevo.',
  'friends.back': 'Atrás',

  'friendRequests.title': 'Solicitudes de amistad',
  'friendRequests.subtitle': 'Personas que quieren conectar contigo en Kairos.',
  'friendRequests.empty': 'No hay solicitudes de amistad pendientes.',
  'friendRequests.error': 'No se pudieron cargar las solicitudes. Por favor, inténtalo de nuevo.',
  'friendRequests.back': 'Atrás',
  'friendRequests.accept': 'Aceptar',
  'friendRequests.decline': 'Rechazar',

  'settings.title': 'Ajustes',
  'settings.subtitle': 'Cuenta y preferencias de la app.',
  'settings.back': 'Atrás',
  'settings.open': 'Abrir ajustes',

  'memories.back': 'Atrás',
  'memories.title': 'Buscar recuerdos',
  'memories.subtitle': 'Encuentra un recuerdo por título.',
  'memories.searchPlaceholder': 'Buscar por título',
  'memories.search': 'Buscar',
  'memories.empty':
    'Aún no tienes recuerdos. Cuando termine un plan, Kairos crea un recuerdo para ti.',
  'memories.loadError': 'No se pudieron cargar tus recuerdos. Por favor, inténtalo de nuevo.',

  'memories.detail.loadError': 'No se pudo cargar este recuerdo. Por favor, inténtalo de nuevo.',
  'memories.detail.participants': 'Participantes',
  'memories.detail.leader': 'Líder',
  'memories.detail.photos': 'Fotos',
  'memories.detail.noPhotos': 'Aún no hay fotos.',
  'memories.detail.addPhoto': 'Añadir foto',
  'memories.detail.personalNote': 'Nota personal',
  'memories.detail.personalNoteHint': 'Privada — solo tú puedes verla.',
  'memories.detail.personalNotePlaceholder': 'Tus pensamientos sobre este momento…',
  'memories.detail.saveNote': 'Guardar nota',
  'memories.detail.leave': 'Salir del recuerdo',

  'memories.participant.deletedUser': 'Usuario eliminado',
  'memories.participant.unknown': 'Desconocido',

  'memories.photoViewer.close': 'Cerrar',
  'memories.photoViewer.openPhoto': 'Ver foto',
  'memories.photoViewer.delete': 'Eliminar foto',
  'memories.photoViewer.index': '{{current}} de {{total}}',

  'memories.deleteConfirm.title': '¿Eliminar esta foto?',
  'memories.deleteConfirm.message':
    'Se eliminará la foto para todos en este recuerdo. No se puede deshacer.',
  'memories.deleteConfirm.confirm': 'Eliminar foto',
  'memories.deleteConfirm.cancel': 'Conservar foto',

  'memories.leaveConfirm.title': '¿Salir de este recuerdo?',
  'memories.leaveConfirm.message':
    'Perderás acceso a este recuerdo. Los demás aún pueden ver el momento compartido.',
  'memories.leaveConfirm.confirm': 'Salir del recuerdo',
  'memories.leaveConfirm.cancel': 'Conservar',
  'memories.leaveConfirm.leaderTitle': 'Elige un nuevo líder',
  'memories.leaveConfirm.leaderMessage':
    'Eres el líder. Elige quién debe hacerse cargo antes de salir.',

  'memories.error.saveNote': 'No se pudo guardar tu nota. Por favor, inténtalo de nuevo.',
  'memories.error.noteTooLong': 'La nota debe tener 1.000 caracteres o menos.',
  'memories.error.addPhoto': 'No se pudo añadir la foto. Por favor, inténtalo de nuevo.',
  'memories.error.deletePhoto': 'No se pudo eliminar la foto. Por favor, inténtalo de nuevo.',
  'memories.error.photoPermission':
    'Se necesita acceso a la galería para añadir una foto.',
  'memories.error.leave': 'No se pudo salir de este recuerdo. Por favor, inténtalo de nuevo.',

  'error.profileLoad': 'No se pudo cargar tu perfil',
  'error.retry': 'Reintentar',
};
